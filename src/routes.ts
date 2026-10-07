import { Router, Request, Response } from 'express';
import { db } from './database.js';
import { extrairDadosNFCe, limparNomeProduto } from './scraper.js';

export const router = Router();

// Helper para buscar nome de estabelecimento simplificado
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
    console.warn('Aviso ao consultar mapeamento:', e);
  }

  return orig;
}


