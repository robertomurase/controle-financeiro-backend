import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe, limparNomeProduto } from './scraper.js';

export const router = Router();

// Helper para buscar nome de estabelecimento simplificado (De-Para)
async function obterEstabelecimentoSimplificado(nomeOriginal: string): Promise<string> {
  if (!nomeOriginal) return 'Cadastro Manual';
  const orig = nomeOriginal.trim();
  if (!orig || orig === 'Cadastro Manual' || orig === 'SEFAZ') return orig;

  try {
    const res = await db.execute('SELECT * FROM mapeamento_estabelecimentos');
    const mapeamentos = res.rows || [];
    const origLower = orig.toLowerCase();

    for (const m of mapeamentos) {
      if (!m.razao_social || !m.nome_simplificado) continue;
      const razaoLower = String(m.razao_social).trim().toLowerCase();
      const simpLower = String(m.nome_simplificado).trim().toLowerCase();

      if (razaoLower === origLower || simpLower === origLower) {
        return String(m.nome_simplificado).trim();
      }
      if (razaoLower.length > 2 && (origLower.includes(razaoLower) || razaoLower.includes(origLower))) {
        return String(m.nome_simplificado).trim();
      }
    }
  } catch (e) {
    console.warn('Aviso ao consultar mapeamento de estabelecimento:', e);
  }

  return orig;
}

// Helper para buscar nome de produto simplificado (De-Para)
async function obterNomeProdutoSimplificado(nomeOriginal: string): Promise<string> {
  if (!nomeOriginal) return '';
  const orig = limparNomeProduto(nomeOriginal).trim();
  if (!orig) return '';

  try {
    const res = await db.execute('SELECT * FROM mapeamento_produtos');
    const mapeamentos = res.rows || [];
    const origLower = orig.toLowerCase();

    for (const m of mapeamentos) {
      if (!m.nome_original || !m.nome_simplificado) continue;
      const originalLower = String(m.nome_original).trim().toLowerCase();
      const simpLower = String(m.nome_simplificado).trim().toLowerCase();

      if (originalLower === origLower || simpLower === origLower) {
        return String(m.nome_simplificado).trim();
      }
      if (originalLower.length > 2 && (origLower.includes(originalLower) || originalLower.includes(origLower))) {
        return String(m.nome_simplificado).trim();
      }
    }
  } catch (e) {
    console.warn('Aviso ao consultar mapeamento de produto:', e);
  }

  return orig;
}

/**
 * ESTABELECIMENTOS MAPEAMENTO ENDPOINTS (De-Para)
 */
router.get('/estabelecimentos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute('SELECT * FROM mapeamento_estabelecimentos ORDER BY razao_social ASC');
    res.json(result.rows);
  } catch (error: any) {
    console.error('Erro ao buscar estabelecimentos:', error);
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

    const rSocial = razaoSocial.trim();
    const nSimp = nomeSimplificado.trim();

    const result = await db.execute({
      sql: 'INSERT INTO mapeamento_estabelecimentos (razao_social, nome_simplificado) VALUES (?, ?) ON CONFLICT(razao_social) DO UPDATE SET nome_simplificado = excluded.nome_simplificado',
      args: [rSocial, nSimp]
    });

    const newId = result.lastInsertRowid ? Number(result.lastInsertRowid) : Date.now();
    res.status(201).json({ message: 'Mapeamento salvo com sucesso', id: newId });
  } catch (error: any) {
    console.error('Erro ao criar estabelecimento:', error);
    res.status(500).json({ error: error?.message || 'Erro ao criar mapeamento' });
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
  } catch (error: any) {
    console.error('Erro ao atualizar estabelecimento:', error);
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
  } catch (error: any) {
    console.error('Erro ao excluir estabelecimento:', error);
    res.status(500).json({ error: 'Erro ao excluir mapeamento' });
  }
});

/**
 * PRODUTOS MAPEAMENTO ENDPOINTS (De-Para)
 */
router.get('/mapeamento-produtos', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute('SELECT * FROM mapeamento_produtos ORDER BY nome_original ASC');
    res.json(result.rows);
  } catch (error: any) {
    console.error('Erro ao buscar mapeamento-produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar mapeamentos de produtos' });
  }
});

router.post('/mapeamento-produtos', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nomeOriginal, nomeSimplificado } = req.body;
    if (!nomeOriginal || !nomeSimplificado) {
      res.status(400).json({ error: 'Nome Original e Nome Simplificado são obrigatórios' });
      return;
    }

    const origLimpo = limparNomeProduto(nomeOriginal).trim();
    const simpLimpo = nomeSimplificado.trim();

    if (!origLimpo) {
      res.status(400).json({ error: 'Nome Original inválido' });
      return;
    }

    const result = await db.execute({
      sql: 'INSERT INTO mapeamento_produtos (nome_original, nome_simplificado) VALUES (?, ?) ON CONFLICT(nome_original) DO UPDATE SET nome_simplificado = excluded.nome_simplificado',
      args: [origLimpo, simpLimpo]
    });

    const newId = result.lastInsertRowid ? Number(result.lastInsertRowid) : Date.now();
    res.status(201).json({ message: 'Mapeamento de produto salvo com sucesso', id: newId });
  } catch (error: any) {
    console.error('Erro ao salvar mapeamento-produtos:', error);
    res.status(500).json({ error: error?.message || 'Erro ao criar mapeamento de produto' });
  }
});

router.put('/mapeamento-produtos/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nomeOriginal, nomeSimplificado } = req.body;
    await db.execute({
      sql: 'UPDATE mapeamento_produtos SET nome_original = ?, nome_simplificado = ? WHERE id = ?',
      args: [limparNomeProduto(nomeOriginal).trim(), nomeSimplificado.trim(), Number(id)]
    });
    res.json({ message: 'Mapeamento de produto atualizado com sucesso' });
  } catch (error: any) {
    console.error('Erro ao atualizar mapeamento-produtos:', error);
    res.status(500).json({ error: 'Erro ao atualizar mapeamento de produto' });
  }
});

router.delete('/mapeamento-produtos/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await db.execute({
      sql: 'DELETE FROM mapeamento_produtos WHERE id = ?',
      args: [Number(id)]
    });
    res.json({ message: 'Mapeamento de produto excluído com sucesso' });
  } catch (error: any) {
    console.error('Erro ao excluir mapeamento-produtos:', error);
    res.status(500).json({ error: 'Erro ao excluir mapeamento de produto' });
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
    const descLimpa = await obterNomeProdutoSimplificado(descricao);

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
  } catch (error: any) {
    console.error('Erro ao salvar transação:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

/**
 * GET /api/transacoes - Retorna todo o histórico de transações em ordem de cadastro (id DESC)
 */

/**
 * GET /api/transacoes/:id/detalhes - Retorna os detalhes da transação e seus itens NFC-e / descontos
 */
router.get('/transacoes/:id/detalhes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const transRes = await db.execute({
      sql: 'SELECT * FROM transacoes WHERE id = ?',
      args: [Number(id)],
    });

    if (!transRes.rows || transRes.rows.length === 0) {
      res.status(404).json({ error: 'Transação não encontrada' });
      return;
    }

    const trans: any = transRes.rows[0];
    let nota: any = null;
    let itens: any[] = [];

    const hash = String(trans.hash_transacao || '');

    // 1. Tentar buscar em notas_fiscais por chave_acesso
    if (hash.startsWith('nfce_')) {
      const chave = hash.replace('nfce_', '').trim();
      const notaRes = await db.execute({
        sql: 'SELECT * FROM notas_fiscais WHERE chave_acesso = ? LIMIT 1',
        args: [chave],
      });
      if (notaRes.rows && notaRes.rows.length > 0) {
        nota = notaRes.rows[0];
        const itensRes = await db.execute({
          sql: 'SELECT * FROM itens_nota WHERE nota_fiscal_id = ? ORDER BY id ASC',
          args: [Number(nota.id)],
        });
        itens = itensRes.rows || [];
      }
    }

    // 2. Se não encontrou por chave, tentar buscar em notas_fiscais por estabelecimento e data
    if (!nota && trans.estabelecimento && trans.data) {
      const dataPrefixo = String(trans.data).split('T')[0];
      const notaRes = await db.execute({
        sql: 'SELECT * FROM notas_fiscais WHERE (LOWER(estabelecimento) = LOWER(?) OR LOWER(estabelecimento) LIKE LOWER(?)) AND data_emissao LIKE ? LIMIT 1',
        args: [trans.estabelecimento, , ],
      });
      if (notaRes.rows && notaRes.rows.length > 0) {
        nota = notaRes.rows[0];
        const itensRes = await db.execute({
          sql: 'SELECT * FROM itens_nota WHERE nota_fiscal_id = ? ORDER BY id ASC',
          args: [Number(nota.id)],
        });
        itens = itensRes.rows || [];
      }
    }

    // 3. Se ainda não encontrou itens, verificar se há itens_nota com mesmo estabelecimento e data
    if (itens.length === 0 && trans.estabelecimento && trans.data) {
      const dataPrefixo = String(trans.data).split('T')[0];
      const itensRes = await db.execute({
        sql: 'SELECT * FROM itens_nota WHERE (LOWER(estabelecimento) = LOWER(?) OR LOWER(estabelecimento) LIKE LOWER(?)) AND data_emissao LIKE ? ORDER BY id ASC',
        args: [trans.estabelecimento, , ],
      });
      if (itensRes.rows && itensRes.rows.length > 0) {
        itens = itensRes.rows;
      }
    }

    // Processar nomes dos produtos com De-Para e limpeza
    const itensFormatados = await Promise.all(itens.map(async (item: any) => {
      const nomeLimpo = limparNomeProduto(String(item.nome_produto || item.nomeProduto || ''));
      const nomeMapeado = await obterNomeProdutoSimplificado(nomeLimpo);
      return {
        id: item.id,
        nomeProduto: nomeMapeado || nomeLimpo,
        nomeOriginal: item.nome_produto || item.nomeProduto,
        codigo: item.codigo || 'SEFAZ',
        quantidade: Number(item.quantidade) || 1.0,
        unidade: item.unidade || 'UN',
        valorUnitario: Number(item.valor_unitario) || 0,
        valorTotal: Number(item.valor_total) || 0
      };
    }));

    // Se no final não houver itens (lançamento manual), criar item representativo
    if (itensFormatados.length === 0) {
      const descLimpa = limparNomeProduto(trans.descricao);
      const descMapeada = await obterNomeProdutoSimplificado(descLimpa);
      itensFormatados.push({
        id: trans.id,
        nomeProduto: descMapeada || descLimpa || trans.descricao,
        nomeOriginal: trans.descricao,
        codigo: 'MANUAL',
        quantidade: Number(trans.quantidade) || 1.0,
        unidade: 'UN',
        valorUnitario: Number(trans.valor_unitario) || Number(trans.valor),
        valorTotal: Number(trans.valor)
      });
    }

    const subtotal = itensFormatados.reduce((acc, it) => acc + (it.valorTotal || (it.valorUnitario * it.quantidade) || 0), 0);
    const valorFinal = Number(nota?.valor_total || trans.valor || 0);
    const descontoBruto = Number(nota?.desconto || 0);
    const descontoCalculado = descontoBruto > 0 ? descontoBruto : Math.max(0, subtotal - valorFinal);

    const estBruto = nota?.estabelecimento || trans.estabelecimento || 'Cadastro Manual';
    const estSimplificado = await obterEstabelecimentoSimplificado(estBruto);

    res.json({
      transacaoId: trans.id,
      isNfce: !!(hash.startsWith('nfce_') || nota),
      chaveAcesso: nota?.chave_acesso || (hash.startsWith('nfce_') ? hash.replace('nfce_', '') : null),
      estabelecimento: estSimplificado || estBruto,
      cnpj: nota?.cnpj || null,
      dataEmissao: nota?.data_emissao || trans.data,
      subtotal: Number(subtotal.toFixed(2)),
      desconto: Number(descontoCalculado.toFixed(2)),
      valorTotal: Number(valorFinal.toFixed(2)),
      itens: itensFormatados
    });
  } catch (error: any) {
    console.error('Erro ao buscar detalhes da transação:', error);
    res.status(500).json({ error: 'Erro ao carregar detalhes da transação' });
  }
});


router.get('/transacoes', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute('SELECT * FROM transacoes ORDER BY id DESC');
    res.json(result.rows);
  } catch (error: any) {
    console.error('Erro ao buscar transacoes:', error);
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

    const descLimpa = descricao ? await obterNomeProdutoSimplificado(descricao) : null;
    const estSimplificado = estabelecimento ? await obterEstabelecimentoSimplificado(estabelecimento) : null;

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
  } catch (error: any) {
    console.error('Erro ao atualizar transacao:', error);
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
  } catch (error: any) {
    console.error('Erro ao excluir transacao:', error);
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

    dadosNota.itens = await Promise.all(dadosNota.itens.map(async item => ({
      ...item,
      nomeProduto: await obterNomeProdutoSimplificado(item.nomeProduto)
    })));

    res.json({ dadosNota });
  } catch (error: any) {
    console.error('Erro ao extrair NFCe:', error);
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
      const nomeLimpo = await obterNomeProdutoSimplificado(item.nomeProduto);
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
          'Mercado',
          'despesa',
          dataEmissaoFormatada,
          hashNfce,
          'Conta Corrente'
        ],
      });
    } catch (e) {}

    res.status(201).json({ message: 'NFC-e e produtos salvos com sucesso!' });
  } catch (error: any) {
    console.error('Erro ao salvar NFCe:', error);
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

    dadosNota.itens = await Promise.all(dadosNota.itens.map(async item => ({
      ...item,
      nomeProduto: await obterNomeProdutoSimplificado(item.nomeProduto)
    })));

    res.status(200).json({
      message: 'NFC-e processada com sucesso!',
      dadosNota,
    });
  } catch (error: any) {
    console.error('Erro ao consultar NFCe:', error);
    res.status(500).json({ error: error?.message || 'Erro ao consultar nota fiscal' });
  }
});

/**
 * GET /api/produtos - Lista de itens INDIVIDUAIS com limpeza do nome e Mapeamento De-Para
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
          AND (LOWER(categoria) = 'mercado' OR LOWER(categoria) LIKE '%mercado%')
      ) sub
      ORDER BY LOWER(nome_produto) ASC, data_emissao DESC
    `;
    const result = await db.execute(sqlQuery);

    let mapeamentosProd: any[] = [];
    try {
      const mRes = await db.execute('SELECT * FROM mapeamento_produtos');
      mapeamentosProd = mRes.rows || [];
    } catch (e) {}

    const limpos = (result.rows || []).map((row: any) => {
      const nomeOriginal = String(row.nome_produto || '');
      const nomeLimpo = limparNomeProduto(nomeOriginal);
      const origLower = nomeLimpo.toLowerCase().trim();
      let nomeFinal = nomeLimpo;

      for (const m of mapeamentosProd) {
        if (!m.nome_original || !m.nome_simplificado) continue;
        const originalLower = String(m.nome_original).trim().toLowerCase();
        if (originalLower === origLower || origLower.includes(originalLower) || originalLower.includes(origLower)) {
          nomeFinal = String(m.nome_simplificado).trim();
          break;
        }
      }

      return {
        ...row,
        nome_produto: nomeFinal
      };
    });

    res.json(limpos);
  } catch (error: any) {
    console.error('Erro ao buscar produtos:', error);
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
  } catch (error: any) {
    console.error('Erro ao remover produto item:', error);
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
      args: [nomeDecodificado, `%${nomeDecodificado}%`],
    });
    try {
      await db.execute({
        sql: "DELETE FROM transacoes WHERE (descricao = ? OR descricao LIKE ?) AND (hash_transacao IS NULL OR hash_transacao NOT LIKE 'nfce_%')",
        args: [nomeDecodificado, `%${nomeDecodificado}%`],
      });
    } catch (e) {}
    res.json({ message: 'Produtos removidos com sucesso' });
  } catch (error: any) {
    console.error('Erro ao remover produto por nome:', error);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});
