import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe } from './scraper.js';

export const router = Router();

/**
 * POST /api/transacoes - Registra uma nova transação manual
 */
router.post('/transacoes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { descricao, valor, quantidade, valorUnitario, estabelecimento, categoria, tipo, data, hashTransacao } = req.body;

    if (!descricao || valor === undefined || !categoria || !tipo || !data) {
      res.status(400).json({ error: 'Campos obrigatórios ausentes' });
      return;
    }

    const valCalc = Number(valor) || 0;
    const qtdCalc = (quantidade !== undefined && quantidade !== null && Number(quantidade) > 0) ? Number(quantidade) : 1.0;
    const valUnitCalc = (valorUnitario !== undefined && valorUnitario !== null && Number(valorUnitario) > 0) ? Number(valorUnitario) : (qtdCalc > 0 ? valCalc / qtdCalc : valCalc);
    const estCalc = (estabelecimento && String(estabelecimento).trim()) ? String(estabelecimento).trim() : 'Cadastro Manual';

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
      sql: 'INSERT INTO transacoes (descricao, valor, quantidade, valor_unitario, estabelecimento, categoria, tipo, data, hash_transacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [descricao, valCalc, qtdCalc, valUnitCalc, estCalc, categoria, tipo, data, hashTransacao || null],
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
 * GET /api/transacoes - Retorna o histórico de transações (Top 10 ou Geral)
 */
router.get('/transacoes', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute('SELECT * FROM transacoes ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ error: 'Erro interno ao consultar transações' });
  }
});

/**
 * POST /api/nfce/extrair - Apenas extrai dados da SEFAZ para conferência prévia
 */
router.post('/nfce/extrair', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }
    const notaExtraida = await extrairDadosNFCe(url);
    res.status(200).json({
      message: 'Dados da nota extraídos para conferência',
      dadosNota: notaExtraida,
    });
  } catch (error: any) {
    console.error('Erro ao extrair NFC-e:', error);
    res.status(500).json({ error: error?.message || 'Erro ao extrair dados do cupom fiscal' });
  }
});

/**
 * POST /api/nfce/salvar - Salva permanentemente no banco a nota previamente extraída
 */
router.post('/nfce/salvar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dadosNota } = req.body;
    if (!dadosNota) {
      res.status(400).json({ error: 'Dados da nota não fornecidos' });
      return;
    }

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
      notaFiscalId = Date.now();
    }

    const dataEmissaoFormatada = dadosNota.dataEmissao
      ? dadosNota.dataEmissao.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const dataCadastroFormatada = new Date().toISOString().split('T')[0];

    for (const item of dadosNota.itens || []) {
      try {
        await db.execute({
          sql: 'INSERT INTO itens_nota (nota_fiscal_id, nome_produto, codigo, quantidade, unidade, valor_unitario, valor_total, data_emissao, data_cadastro, estabelecimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [
            notaFiscalId,
            item.nomeProduto,
            item.codigo || null,
            item.quantidade,
            item.unidade,
            item.valorUnitario,
            item.valorTotal,
            dataEmissaoFormatada,
            dataCadastroFormatada,
            dadosNota.estabelecimento || 'SEFAZ'
          ],
        });
      } catch (e) {}
    }

    const hashNfce = 'nfce_' + dadosNota.chaveAcesso;
    try {
      const transExistente = await db.execute({
        sql: 'SELECT id FROM transacoes WHERE hash_transacao = ? LIMIT 1',
        args: [hashNfce],
      });

      if (transExistente.rows && transExistente.rows.length > 0) {
        await db.execute({
          sql: 'UPDATE transacoes SET descricao = ?, valor = ?, data = ?, estabelecimento = ? WHERE hash_transacao = ?',
          args: [dadosNota.estabelecimento, dadosNota.valorTotal, dataEmissaoFormatada, dadosNota.estabelecimento, hashNfce],
        });
      } else {
        await db.execute({
          sql: 'INSERT INTO transacoes (descricao, valor, quantidade, valor_unitario, estabelecimento, categoria, tipo, data, hash_transacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [
            dadosNota.estabelecimento,
            dadosNota.valorTotal,
            1.0,
            dadosNota.valorTotal,
            dadosNota.estabelecimento,
            'Alimentação / Mercado',
            'despesa',
            dataEmissaoFormatada,
            hashNfce,
          ],
        });
      }
    } catch (e) {}

    res.status(201).json({ message: 'NFC-e e produtos salvos com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao salvar NFC-e:', error);
    res.status(500).json({ error: error?.message || 'Erro ao processar cupom fiscal' });
  }
});

/**
 * POST /api/nfce/consultar - Fallback para extrair e salvar na mesma chamada
 */
router.post('/nfce/consultar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, dadosNota } = req.body;
    if (!url && !dadosNota) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }
    const notaExtraida = dadosNota || await extrairDadosNFCe(url);
    res.status(200).json({ message: 'OK', dadosNota: notaExtraida });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Erro ao processar cupom fiscal' });
  }
});

/**
 * GET /api/produtos - Lista de produtos unificada (Notas Fiscais + Transações Manuais exceto Salário)
 */
router.get('/produtos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sqlQuery = ;
    const result = await db.execute(sqlQuery);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar lista de produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

/**
 * DELETE /api/produtos/item/:id - Remove um item específico pelo ID e origem
 */
router.delete('/produtos/item/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { origem } = req.query;

    if (origem === 'transacao') {
      await db.execute({
        sql: 'DELETE FROM transacoes WHERE id = ?',
        args: [Number(id)],
      });
    } else {
      await db.execute({
        sql: 'DELETE FROM itens_nota WHERE id = ?',
        args: [Number(id)],
      });
    }

    res.json({ message: 'Item removido com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir item de produto por ID:', error);
    res.status(500).json({ error: 'Erro ao remover item' });
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
