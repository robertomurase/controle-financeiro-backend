import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe } from './scraper.js';

export const router = Router();

router.post('/transacoes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { descricao, valor, categoria, tipo, data, hashTransacao } = req.body;

    if (!descricao || valor === undefined || !categoria || !tipo || !data) {
      res.status(400).json({ error: 'Campos obrigatórios ausentes' });
      return;
    }

    if (hashTransacao) {
      try {
        const transEx = await db.execute({
          sql: 'SELECT id FROM transacoes WHERE hash_transacao = ? LIMIT 1',
          args: [hashTransacao],
        });
        if (transEx.rows && transEx.rows.length > 0) {
          res.status(200).json({ message: 'Transação já existente', affectedRows: 0 });
          return;
        }
      } catch (e) {
        console.warn('Aviso ao consultar hash_transacao:', e);
      }
    }

    const result = await db.execute({
      sql: 'INSERT INTO transacoes (descricao, valor, categoria, tipo, data, hash_transacao) VALUES (?, ?, ?, ?, ?, ?)',
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

router.get('/transacoes', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute('SELECT * FROM transacoes ORDER BY data DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ error: 'Erro interno ao consultar transações' });
  }
});

router.post('/nfce/consultar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }

    const dadosNota = await extrairDadosNFCe(url);

    let notaFiscalId: number | null = null;
    try {
      const notaExistente = await db.execute({
        sql: 'SELECT id FROM notas_fiscais WHERE chave_acesso = ? LIMIT 1',
        args: [dadosNota.chaveAcesso],
      });

      if (notaExistente.rows && notaExistente.rows.length > 0) {
        notaFiscalId = Number(notaExistente.rows[0].id);
        await db.execute({
          sql: 'UPDATE notas_fiscais SET valor_total = ?, desconto = ?, estabelecimento = ?, cnpj = ? WHERE id = ?',
          args: [
            dadosNota.valorTotal,
            dadosNota.desconto,
            dadosNota.estabelecimento,
            dadosNota.cnpj || null,
            notaFiscalId
          ],
        });
      } else {
        const notaResult = await db.execute({
          sql: 'INSERT INTO notas_fiscais (chave_acesso, estabelecimento, cnpj, data_emissao, valor_total, desconto) VALUES (?, ?, ?, ?, ?, ?)',
          args: [
            dadosNota.chaveAcesso,
            dadosNota.estabelecimento,
            dadosNota.cnpj || null,
            dadosNota.dataEmissao,
            dadosNota.valorTotal,
            dadosNota.desconto,
          ],
        });
        notaFiscalId = Number(notaResult.rows[0]?.id || notaResult.lastInsertRowid);
      }
    } catch (e) {
      console.warn('Aviso ao inserir nota_fiscal:', e);
      notaFiscalId = Date.now();
    }

    for (const item of dadosNota.itens) {
      try {
        await db.execute({
          sql: 'INSERT INTO itens_nota (nota_fiscal_id, nome_produto, codigo, quantidade, unidade, valor_unitario, valor_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
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
      } catch (e) {
        console.warn('Aviso ao inserir item_nota:', e);
      }
    }

    const dataFormatada = dadosNota.dataEmissao
      ? dadosNota.dataEmissao.split('T')[0]
      : new Date().toISOString().split('T')[0];

    const hashNfce = 'nfce_' + dadosNota.chaveAcesso;
    try {
      const transExistente = await db.execute({
        sql: 'SELECT id FROM transacoes WHERE hash_transacao = ? LIMIT 1',
        args: [hashNfce],
      });

      if (transExistente.rows && transExistente.rows.length > 0) {
        await db.execute({
          sql: 'UPDATE transacoes SET descricao = ?, valor = ?, data = ? WHERE hash_transacao = ?',
          args: [dadosNota.estabelecimento, dadosNota.valorTotal, dataFormatada, hashNfce],
        });
      } else {
        await db.execute({
          sql: 'INSERT INTO transacoes (descricao, valor, categoria, tipo, data, hash_transacao) VALUES (?, ?, ?, ?, ?, ?)',
          args: [
            dadosNota.estabelecimento,
            dadosNota.valorTotal,
            'Alimentação / Mercado',
            'despesa',
            dataFormatada,
            hashNfce,
          ],
        });
      }
    } catch (e) {
      console.warn('Aviso ao salvar transacao da nfce:', e);
    }

    res.status(201).json({
      message: 'NFC-e processada e registrada com sucesso!',
      notaFiscalId,
      dadosNota,
    });
  } catch (error: any) {
    console.error('Erro ao consultar e registrar NFC-e:', error);
    res.status(500).json({ error: error?.message || 'Erro ao processar cupom fiscal' });
  }
});

router.get('/produtos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(`
      SELECT 
        nome_produto,
        MAX(codigo) AS codigo,
        COUNT(id) AS total_compras,
        SUM(quantidade) AS quantidade_total,
        AVG(valor_unitario) AS preco_medio,
        SUM(valor_total) AS gasto_total,
        MAX(unidade) AS unidade
      FROM (
        SELECT 
          nome_produto,
          codigo,
          id,
          quantidade,
          valor_unitario,
          valor_total,
          unidade
        FROM itens_nota

        UNION ALL

        SELECT 
          descricao AS nome_produto,
          'MANUAL' AS codigo,
          id,
          1.0 AS quantidade,
          valor AS valor_unitario,
          valor AS valor_total,
          'UN' AS unidade
        FROM transacoes
        WHERE tipo = 'despesa'
          AND (hash_transacao IS NULL OR hash_transacao NOT LIKE 'nfce_%')
      ) sub
      GROUP BY nome_produto
      ORDER BY gasto_total DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar lista de produtos unificada, usando fallback de itens_nota:', error);
    try {
      const fallback = await db.execute(`
        SELECT 
          nome_produto,
          MAX(codigo) AS codigo,
          COUNT(id) AS total_compras,
          SUM(quantidade) AS quantidade_total,
          AVG(valor_unitario) AS preco_medio,
          SUM(valor_total) AS gasto_total,
          MAX(unidade) AS unidade
        FROM itens_nota
        GROUP BY nome_produto
        ORDER BY gasto_total DESC
      `);
      res.json(fallback.rows);
    } catch (err2) {
      res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
  }
});

router.delete('/produtos/:nome', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome } = req.params;
    const nomeDecodificado = decodeURIComponent(nome);
    await db.execute({
      sql: 'DELETE FROM itens_nota WHERE nome_produto = ?',
      args: [nomeDecodificado],
    });
    try {
      await db.execute({
        sql: "DELETE FROM transacoes WHERE descricao = ? AND (hash_transacao IS NULL OR hash_transacao NOT LIKE 'nfce_%')",
        args: [nomeDecodificado],
      });
    } catch (e) {}
    res.json({ message: 'Produtos removidos com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});