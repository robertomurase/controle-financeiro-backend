import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe, limparNomeProduto } from './scraper.js';

export const router = Router();

// Helper para buscar nome de estabelecimento simplificado
async function obterEstabelecimentoSimplificado(nomeOriginal: string): Promise<string> {
  if (!nomeOriginal) return 'Cadastro Manual';
  try {
    const res = await db.execute('SELECT * FROM mapeamento_estabelecimentos');
    const mapeamentos = res.rows || [];
    const orig = nomeOriginal.trim().toLowerCase();
    
    // Match exato
    const exato = mapeamentos.find((m: any) => m.razao_social && String(m.razao_social).trim().toLowerCase() === orig);
    if (exato && exato.nome_simplificado) {
      return String(exato.nome_simplificado).trim();
    }

    // Match parcial
    const parcial = mapeamentos.find((m: any) => m.razao_social && orig.includes(String(m.razao_social).trim().toLowerCase()));
    if (parcial && parcial.nome_simplificado) {
      return String(parcial.nome_simplificado).trim();
    }
  } catch (e) {}
  return nomeOriginal.trim();
}

/**
 * ESTABELECIMENTOS MAPEAMENTO ENDPOINTS (De-Para)
 */
router.get('/estabelecimentos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute('SELECT * FROM mapeamento_estabelecimentos ORDER BY razao_social ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar mapeamentos de estabelecimentos' });
  }
});

router.post('/estabelecimentos', async (req: Request, res: Response): Promise<void> => {
  try {
    const { razaoSocial, nomeSimplificado } = req.body;
    if (!razaoSocial || !nomeSimplificado) {
      res.status(400).json({ error: 'Razão Social e Nome Simplificado são obrigatórios' });
      return;
    }
    const result = await db.execute({
      sql: 'INSERT INTO mapeamento_estabelecimentos (razao_social, nome_simplificado) VALUES (?, ?)',
      args: [razaoSocial.trim(), nomeSimplificado.trim()]
    });
    res.status(201).json({ message: 'Mapeamento criado com sucesso', id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao criar mapeamento (Razão Social já existe?)' });
  }
});

router.put('/estabelecimentos/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { razaoSocial, nomeSimplificado } = req.body;
    await db.execute({
      sql: 'UPDATE mapeamento_estabelecimentos SET razao_social = ?, nome_simplificado = ? WHERE id = ?',
      args: [razaoSocial.trim(), nomeSimplificado.trim(), Number(id)]
    });
    res.json({ message: 'Mapeamento atualizado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar mapeamento' });
  }
});

router.delete('/estabelecimentos/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await db.execute({
      sql: 'DELETE FROM mapeamento_estabelecimentos WHERE id = ?',
      args: [Number(id)]
    });
    res.json({ message: 'Mapeamento excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir mapeamento' });
  }
});

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
    const estOriginal = estabelecimento || 'Cadastro Manual';
    const estCalc = await obterEstabelecimentoSimplificado(estOriginal);
    const contaCalc = conta || 'Conta Corrente';
    const descLimpa = limparNomeProduto(descricao);

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
      } catch (e) {}
    }

    let result;
    try {
      result = await db.execute({
        sql: 'INSERT INTO transacoes (descricao, valor, quantidade, valor_unitario, estabelecimento, categoria, tipo, data, hash_transacao, conta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [descLimpa, valCalc, qtdCalc, valUnitCalc, estCalc, categoria, tipo, data, hashTransacao || null, contaCalc],
      });
    } catch (e) {
      result = await db.execute({
        sql: 'INSERT INTO transacoes (descricao, valor, quantidade, valor_unitario, estabelecimento, categoria, tipo, data, hash_transacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [descLimpa, valCalc, qtdCalc, valUnitCalc, estCalc, categoria, tipo, data, hashTransacao || null],
      });
    }

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

    const descLimpa = descricao ? limparNomeProduto(descricao) : null;
    const estSimplificado = estabelecimento ? await obterEstabelecimentoSimplificado(estabelecimento) : null;

    await db.execute({
      sql: ,
      args: [
        descLimpa,
        valor !== undefined ? Number(valor) : null,
        categoria || null,
        tipo || null,
        data || null,
        estSimplificado,
        conta || null,
        Number(id)
      ],
    });

    res.json({ message: 'Transação atualizada com sucesso' });
  } catch (error) {
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
    res.status(500).json({ error: 'Erro ao excluir transação' });
  }
});

/**
 * POST /api/nfce/extrair - Apenas extrai os dados da SEFAZ para pré-visualização (com limpeza e mapeamento)
 */
router.post('/nfce/extrair', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }

    const dadosNota = await extrairDadosNFCe(url);
    const estSimplificado = await obterEstabelecimentoSimplificado(dadosNota.estabelecimento);
    dadosNota.estabelecimento = estSimplificado;

    dadosNota.itens = dadosNota.itens.map(item => ({
      ...item,
      nomeProduto: limparNomeProduto(item.nomeProduto)
    }));

    res.json({ dadosNota });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Erro ao extrair cupom fiscal' });
  }
});

/**
 * POST /api/nfce/salvar - Salva os dados confirmados na pré-visualização da NFC-e
 */
router.post('/nfce/salvar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dadosNota } = req.body;
    if (!dadosNota || !dadosNota.chaveAcesso) {
      res.status(400).json({ error: 'Dados da nota fiscal ausentes' });
      return;
    }

    const estSimplificado = await obterEstabelecimentoSimplificado(dadosNota.estabelecimento);
    dadosNota.estabelecimento = estSimplificado;

    let notaFiscalId: number | null = null;
    try {
      const notaExistente = await db.execute({
        sql: 'SELECT id FROM notas_fiscais WHERE chave_acesso = ? LIMIT 1',
        args: [dadosNota.chaveAcesso],
      });

      if (notaExistente.rows && notaExistente.rows.length > 0) {
        notaFiscalId = Number(notaExistente.rows[0].id);
      } else {
        const notaResult = await db.execute({
          sql: 'INSERT INTO notas_fiscais (chave_acesso, estabelecimento, cnpj, data_emissao, valor_total, desconto) VALUES (?, ?, ?, ?, ?, ?)',
          args: [
            dadosNota.chaveAcesso,
            estSimplificado,
            dadosNota.cnpj || null,
            dadosNota.dataEmissao,
            dadosNota.valorTotal,
            dadosNota.desconto || 0.0,
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

    // Salva cada item na tabela itens_nota
    for (const item of (dadosNota.itens || [])) {
      const nomeLimpo = limparNomeProduto(item.nomeProduto);
      try {
        await db.execute({
          sql: 'INSERT INTO itens_nota (nota_fiscal_id, nome_produto, codigo, quantidade, unidade, valor_unitario, valor_total, data_emissao, data_cadastro, estabelecimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [
            notaFiscalId,
            nomeLimpo,
            item.codigo || null,
            item.quantidade,
            item.unidade,
            item.valorUnitario,
            item.valorTotal,
            dataEmissaoFormatada,
            dataCadastroFormatada,
            estSimplificado
          ],
        });
      } catch (e) {}
    }

    // Salva a transação consolidada em Saídas / Dashboard
    const hashNfce = 'nfce_' + dadosNota.chaveAcesso;
    try {
      await db.execute({
        sql: 'INSERT INTO transacoes (descricao, valor, quantidade, valor_unitario, estabelecimento, categoria, tipo, data, hash_transacao, conta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          estSimplificado,
          dadosNota.valorTotal,
          1.0,
          dadosNota.valorTotal,
          estSimplificado,
          'Alimentação / Mercado',
          'despesa',
          dataEmissaoFormatada,
          hashNfce,
          'Conta Corrente'
        ],
      });
    } catch (e) {}

    res.status(201).json({ message: 'NFC-e e produtos salvos com sucesso!' });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao salvar a nota fiscal' });
  }
});

/**
 * POST /api/nfce/consultar - Mantido para compatibilidade total em 1 passo
 */
router.post('/nfce/consultar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL do QR Code é obrigatória' });
      return;
    }
    const dadosNota = await extrairDadosNFCe(url);
    const estSimplificado = await obterEstabelecimentoSimplificado(dadosNota.estabelecimento);
    dadosNota.estabelecimento = estSimplificado;

    dadosNota.itens = dadosNota.itens.map(item => ({
      ...item,
      nomeProduto: limparNomeProduto(item.nomeProduto)
    }));

    res.status(200).json({
      message: 'NFC-e processada com sucesso!',
      dadosNota,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Erro ao consultar nota fiscal' });
  }
});

/**
 * GET /api/produtos - Lista de itens INDIVIDUAIS com limpeza do nome
 */
router.get('/produtos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sqlQuery = ;
    const result = await db.execute(sqlQuery);
    const limpos = (result.rows || []).map((row: any) => ({
      ...row,
      nome_produto: limparNomeProduto(String(row.nome_produto || ''))
    }));
    res.json(limpos);
  } catch (error) {
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
      sql: 'DELETE FROM itens_nota WHERE nome_produto = ? OR nome_produto LIKE ?',
      args: [nomeDecodificado, ],
    });
    try {
      await db.execute({
        sql: "DELETE FROM transacoes WHERE (descricao = ? OR descricao LIKE ?) AND (hash_transacao IS NULL OR hash_transacao NOT LIKE 'nfce_%')",
        args: [nomeDecodificado, ],
      });
    } catch (e) {}
    res.json({ message: 'Produtos removidos com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});
