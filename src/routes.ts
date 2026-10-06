import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe } from './scraper.js';

export const router = Router();

/**
 * POST /api/transacoes - Registra uma nova transação manual com quantidade e estabelecimento
 */
router.post('/transacoes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { descricao, valor, valorUnitario, quantidade, estabelecimento, categoria, tipo, data, hashTransacao, conta } = req.body;

    if (!descricao || valor === undefined || !categoria || !tipo || !data) {
      res.status(400).json({ error: 'Campos obrigatórios ausentes' });
      return;
    }

    const valCalc = Number(valor) || 0;
    const qtdCalc = Number(quantidade) || 1.0;
    const valUnitCalc = Number(valorUnitario) || (qtdCalc > 0 ? valCalc / qtdCalc : valCalc);
    const estCalc = estabelecimento || 'Cadastro Manual';
    const contaCalc = conta || 'Conta Corrente';

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
      sql: 'INSERT INTO transacoes (descricao, valor, quantidade, valor_unitario, estabelecimento, categoria, tipo, data, hash_transacao, conta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [descricao, valCalc, qtdCalc, valUnitCalc, estCalc, categoria, tipo, data, hashTransacao || null, contaCalc],
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
 * PUT /api/transacoes/:id - Atualiza uma transação por ID
 */
router.put('/transacoes/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { descricao, valor, categoria, tipo, data, estabelecimento, conta } = req.body;

    await db.execute({
      sql: `UPDATE transacoes SET 
              descricao = COALESCE(?, descricao),
              valor = COALESCE(?, valor),
              categoria = COALESCE(?, categoria),
              tipo = COALESCE(?, tipo),
              data = COALESCE(?, data),
              estabelecimento = COALESCE(?, estabelecimento),
              conta = COALESCE(?, conta)
            WHERE id = ?`,
      args: [
        descricao || null,
        valor !== undefined ? Number(valor) : null,
        categoria || null,
        tipo || null,
        data || null,
        estabelecimento || null,
        conta || null,
        Number(id)
      ],
    });

    res.json({ message: 'Transação atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar transação:', error);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

/**
 * DELETE /api/transacoes/:id - Exclui uma transação por ID
 */
router.delete('/transacoes/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await db.execute({
      sql: 'DELETE FROM transacoes WHERE id = ?',
      args: [Number(id)],
    });

    res.json({ message: 'Transação excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir transação:', error);
    res.status(500).json({ error: 'Erro ao excluir transação' });
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
    for (const item of dadosNota.itens) {
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
    console.error('Erro ao consultar e registrar NFC-e:', error);
    res.status(500).json({ error: error?.message || 'Erro ao processar cupom fiscal' });
  }
});

/**
 * GET /api/produtos - Lista de itens INDIVIDUAIS com ESTABELECIMENTO, QTD e DATAS
 */
router.get('/produtos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sqlQuery = `
      SELECT * FROM (
        SELECT 
          i.id,
          i.nome_produto,
          i.codigo,
          i.quantidade,
          i.unidade,
          i.valor_unitario,
          i.valor_total,
          COALESCE(i.data_emissao, nf.data_emissao, date('now')) AS data_emissao,
          COALESCE(i.data_cadastro, date('now')) AS data_cadastro,
          COALESCE(i.estabelecimento, nf.estabelecimento, 'Cadastro Manual') AS estabelecimento,
          'item_nota' AS origem
        FROM itens_nota i
        LEFT JOIN notas_fiscais nf ON i.nota_fiscal_id = nf.id

        UNION ALL

        SELECT 
          id,
          descricao AS nome_produto,
          'MANUAL' AS codigo,
          COALESCE(quantidade, 1.0) AS quantidade,
          'UN' AS unidade,
          COALESCE(valor_unitario, valor) AS valor_unitario,
          valor AS valor_total,
          data AS data_emissao,
          data AS data_cadastro,
          COALESCE(estabelecimento, 'Cadastro Manual') AS estabelecimento,
          'transacao' AS origem
        FROM transacoes
        WHERE tipo = 'despesa'
          AND (hash_transacao IS NULL OR hash_transacao NOT LIKE 'nfce_%')
      ) sub
      ORDER BY LOWER(nome_produto) ASC, data_emissao DESC
    `;
    const result = await db.execute(sqlQuery);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar lista de produtos individualizada, tentando fallback:', error);
    try {
      const fallbackQuery = `
        SELECT * FROM (
          SELECT 
            i.id,
            i.nome_produto,
            i.codigo,
            i.quantidade,
            i.unidade,
            i.valor_unitario,
            i.valor_total,
            COALESCE(i.data_emissao, date('now')) AS data_emissao,
            COALESCE(i.data_cadastro, date('now')) AS data_cadastro,
            COALESCE(i.estabelecimento, 'Cadastro Manual') AS estabelecimento,
            'item_nota' AS origem
          FROM itens_nota i
        ) sub
        ORDER BY LOWER(nome_produto) ASC, data_emissao DESC
      `;
      const fallback = await db.execute(fallbackQuery);
      res.json(fallback.rows);
    } catch (err2) {
      res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
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
