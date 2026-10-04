import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url,
  authToken,
});

export async function initDb(): Promise<void> {
  console.log('🔄 Inicializando e verificando schema do Turso...');

  // 1. Tabela de Transações
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      categoria TEXT NOT NULL,
      tipo TEXT CHECK(tipo IN ('receita', 'despesa')) NOT NULL,
      data TEXT NOT NULL,
      hash_transacao TEXT
    );
  `);

  // 2. Tabela de Notas Fiscais
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave_acesso TEXT NOT NULL,
      estabelecimento TEXT NOT NULL,
      cnpj TEXT,
      data_emissao TEXT NOT NULL,
      valor_total REAL NOT NULL,
      desconto REAL DEFAULT 0.0
    );
  `);

  // 3. Tabela de Itens da Nota
  await db.execute(`
    CREATE TABLE IF NOT EXISTS itens_nota (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nota_fiscal_id INTEGER NOT NULL,
      nome_produto TEXT NOT NULL,
      codigo TEXT,
      quantidade REAL NOT NULL,
      unidade TEXT NOT NULL,
      valor_unitario REAL NOT NULL,
      valor_total REAL NOT NULL,
      FOREIGN KEY (nota_fiscal_id) REFERENCES notas_fiscais(id) ON DELETE CASCADE
    );
  `);

  // Migrações de colunas
  const migracoes = [
    { t: 'transacoes', c: 'hash_transacao', sql: 'ALTER TABLE transacoes ADD COLUMN hash_transacao TEXT' },
    { t: 'notas_fiscais', c: 'cnpj', sql: 'ALTER TABLE notas_fiscais ADD COLUMN cnpj TEXT' },
    { t: 'notas_fiscais', c: 'data_emissao', sql: 'ALTER TABLE notas_fiscais ADD COLUMN data_emissao TEXT' },
    { t: 'notas_fiscais', c: 'desconto', sql: 'ALTER TABLE notas_fiscais ADD COLUMN desconto REAL DEFAULT 0.0' },
    { t: 'itens_nota', c: 'codigo', sql: 'ALTER TABLE itens_nota ADD COLUMN codigo TEXT' },
  ];

  for (const m of migracoes) {
    try {
      await db.execute(m.sql);
      console.log(`✅ Coluna ${m.c} adicionada em ${m.t}`);
    } catch (e: any) {
      console.log(`ℹ️ Migração ${m.t}.${m.c}: ${e?.message || 'Já existe'}`);
    }
  }

  // Índices
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_transacoes_hash ON transacoes(hash_transacao)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_notas_chave ON notas_fiscais(chave_acesso)`);
  } catch (e) {
    console.warn('Aviso ao criar índices:', e);
  }

  console.log('✅ Banco de dados v9 pronto!');
}