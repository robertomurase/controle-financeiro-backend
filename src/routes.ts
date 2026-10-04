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
      sql: ,
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
      sql: ,
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
        sql: ,
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

    await db.execute({
      sql: ,
      args: [
        ,
        dadosNota.valorTotal,
        'Alimentação / Mercado',
        'despesa',
        dataFormatada,
        ,
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
    const result = await db.execute();
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
      sql: 'DELETE FROM transacoes WHERE descricao = ? AND (hash_transacao IS NULL OR hash_transacao NOT LIKE nfce_%)',
      args: [nomeDecodificado],
    });
    res.json({ message: 'Produtos e transações manuais correspondentes removidos com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});
