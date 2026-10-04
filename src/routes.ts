import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe } from './scraper.js';

export const router = Router();

/**
 * POST /api/transacoes - Registra uma nova transação manual com trava contra duplicação
 */
router.post('/transacoes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { descricao, valor, categoria, tipo, data, hashTransacao } = req.body;

    if (!descricao || valor === undefined || !categoria || !tipo || !data) {
      res.status(400).json({ error: 'Campos obrigatórios ausentes' });
      return;
    }

    const result = await db.execute({
      sql: `INSERT INTO transacoes (descricao, valor, categoria, tipo, data, hash_transacao)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(hash_transacao) DO NOTHING`,
      args: [descricao, valor, categoria, tipo, data, hashTransacao || null],
    });

    res.status(201).json({
      message: 'Transação salva com sucesso',
      affectedRows: result.rowsAffected,
    });
  } catch (error) {
    console.error('Erro ao salvar transação:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

/**
 * GET /api/transacoes - Retorna todo o histórico de transações
 */
router.get('/transacoes', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute('SELECT * FROM transacoes ORDER BY data DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ error: 'Erro interno ao consultar transações' });
  }
});

/**
 * POST /api/nfce/consultar - Realiza a raspagem do QR Code NFC-e e registra no BD
 */
router.post('/nfce/consultar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }

    const dadosNota = await extrairDadosNFCe(url);

    // 1. Salva a Nota Fiscal no BD
    const notaResult = await db.execute({
      sql: `INSERT INTO notas_fiscais (chave_acesso, estabelecimento, cnpj, data_emissao, valor_total, desconto)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(chave_acesso) DO UPDATE SET valor_total=excluded.valor_total
            RETURNING id`,
      args: [
        dadosNota.chaveAcesso,
        dadosNota.estabelecimento,
        dadosNota.cnpj || null,
        dadosNota.dataEmissao,
        dadosNota.valorTotal,
        dadosNota.desconto,
      ],
    });

    const notaFiscalId = Number(notaResult.rows[0]?.id || notaResult.lastInsertRowid);

    // 2. Salva cada Item da Nota Fiscal em itens_nota
    for (const item of dadosNota.itens) {
      await db.execute({
        sql: `INSERT INTO itens_nota (nota_fiscal_id, nome_produto, codigo, quantidade, unidade, valor_unitario, valor_total)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          notaFiscalId,
          item.nomeProduto,
          item.codigo || null,
          item.quantidade,
          item.unidade,
          item.valorUnitario,
          item.valorTotal,
        ],
      });
    }

    // 3. Registra a compra em transacoes (Dashboard)
    const dataFormatada = dadosNota.dataEmissao
      ? dadosNota.dataEmissao.split('T')[0]
      : new Date().toISOString().split('T')[0];

    const hashNfce = `nfce_${dadosNota.chaveAcesso}`;

    await db.execute({
      sql: `INSERT INTO transacoes (descricao, valor, categoria, tipo, data, hash_transacao)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(hash_transacao) DO NOTHING`,
      args: [
        dadosNota.estabelecimento,
        dadosNota.valorTotal,
        'Alimentação / Mercado',
        'despesa',
        dataFormatada,
        hashNfce,
      ],
    });

    res.status(201).json({
      message: 'NFC-e processada e registrada com sucesso!',
      notaFiscalId,
      dadosNota,
    });
  } catch (error) {
    console.error('Erro ao consultar e registrar NFC-e:', error);
    res.status(500).json({ error: 'Erro ao processar cupom fiscal' });
  }
});

/**
 * GET /api/produtos - Lista unificada de produtos (NFC-e + Transações Manuais de Despesa)
 */
router.get('/produtos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(`
      SELECT 
        nome_produto,
        codigo,
        unidade,
        SUM(quantidade) as quantidade_total,
        AVG(valor_unitario) as preco_medio,
        SUM(valor_total) as gasto_total,
        COUNT(id) as total_compras
      FROM (
        SELECT 
          id,
          nome_produto,
          codigo,
          quantidade,
          unidade,
          valor_unitario,
          valor_total
        FROM itens_nota
        
        UNION ALL
        
        SELECT 
          id,
          descricao as nome_produto,
          'MANUAL' as codigo,
          1.0 as quantidade,
          'UN' as unidade,
          valor as valor_unitario,
          valor as valor_total
        FROM transacoes
        WHERE tipo = 'despesa' AND (hash_transacao IS NULL OR hash_transacao NOT LIKE 'nfce_%')
      )
      GROUP BY nome_produto
      ORDER BY gasto_total DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar lista de produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

/**
 * DELETE /api/produtos/:nome - Remove itens correspondentes pelo nome
 */
router.delete('/produtos/:nome', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome } = req.params;
    const nomeDecodificado = decodeURIComponent(nome);
    await db.execute({
      sql: 'DELETE FROM itens_nota WHERE nome_produto = ?',
      args: [nomeDecodificado],
    });
    await db.execute({
      sql: "DELETE FROM transacoes WHERE descricao = ? AND (hash_transacao IS NULL OR hash_transacao NOT LIKE 'nfce_%')",
      args: [nomeDecodificado],
    });
    res.json({ message: 'Produtos e transações manuais correspondentes removidos com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});
