import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe } from './scraper.js';

export const router = Router();

/**
 * POST /api/transacoes - Registra uma nova transação manual
 */
router.post('/transacoes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { descricao, valor, categoria, tipo, data, hashTransacao } = req.body;

    if (!descricao || valor === undefined || !categoria || !tipo || !data) {
      res.status(400).json({ error: 'Campos obrigatórios ausentes' });
      return;
    }

    const valCalc = Number(valor) || 0;

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
      args: [descricao, valCalc, 1.0, valCalc, 'Cadastro Manual', categoria, tipo, data, hashTransacao || null],
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
 * GET /api/transacoes - Retorna todo o histórico de transações em ordem de cadastro (id DESC)
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
 * POST /api/nfce/extrair - Apens extrai os dados da NFC-e da SEFAZ sem salvar no banco de dados
 */
router.post('/nfce/extrair', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }

    const dadosNota = await extrairDadosNFCe(url);
    res.status(200).json({
      message: 'Nota extraída com sucesso!',
      dadosNota,
    });
  } catch (error: any) {
    console.error('Erro ao extrair NFC-e:', error);
    res.status(500).json({ error: error?.message || 'Erro ao consultar cupom fiscal junto à SEFAZ' });
  }
});

/**
 * POST /api/nfce/salvar - Salva a nota fiscal extraída e seus produtos no banco de dados
 */
router.post('/nfce/salvar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dadosNota } = req.body;

    if (!dadosNota || !dadosNota.chaveAcesso) {
      res.status(400).json({ error: 'Dados da nota fiscal são obrigatórios' });
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
      console.warn('Aviso ao registrar nota_fiscal:', e);
      notaFiscalId = Date.now();
    }

    const dataEmissaoFormatada = dadosNota.dataEmissao
      ? dadosNota.dataEmissao.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const dataCadastroFormatada = new Date().toISOString().split('T')[0];

    // Salva cada Item da Nota Fiscal com Estabelecimento
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
      } catch (e) {
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
        } catch (err2) {
          console.error('Erro ao salvar item_nota:', err2);
        }
      }
    }

    // Registra no Dashboard (Transações)
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
    } catch (e) {
      console.warn('Aviso ao salvar transacao da nfce:', e);
    }

    res.status(201).json({
      message: 'NFC-e processada e registrada com sucesso!',
      notaFiscalId,
      dadosNota,
    });
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

    if (dadosNota) {
      // Já possui dadosNota -> chama salvar
      const reqSalvar = { body: { dadosNota } } as Request;
      return router.handle(reqSalvar, res, () => {});
    }

    if (!url) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }

    const notaExtraida = await extrairDadosNFCe(url);
    const reqSalvar = { body: { dadosNota: notaExtraida } } as Request;
    // Processa o salvamento
    let notaFiscalId: number | null = Date.now();
    const dataEmissaoFormatada = notaExtraida.dataEmissao
      ? notaExtraida.dataEmissao.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const dataCadastroFormatada = new Date().toISOString().split('T')[0];

    for (const item of notaExtraida.itens || []) {
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
            notaExtraida.estabelecimento || 'SEFAZ'
          ],
        });
      } catch (e) {}
    }

    res.status(201).json({
      message: 'NFC-e processada com sucesso!',
      notaFiscalId,
      dadosNota: notaExtraida,
    });
  } catch (error: any) {
    console.error('Erro ao consultar NFC-e:', error);
    res.status(500).json({ error: error?.message || 'Erro ao processar cupom fiscal' });
  }
});

/**
 * GET /api/produtos - Lista de itens INDIVIDUAIS da Lista de Produtos (Apenas itens de Notas Fiscais)
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
    await db.execute({
      sql: 'DELETE FROM itens_nota WHERE id = ?',
      args: [Number(id)],
    });
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
    res.json({ message: 'Produtos removidos com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});
