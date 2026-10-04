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
  // 1. Tabela de Transações Financeiras
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      categoria TEXT NOT NULL,
      tipo TEXT CHECK(tipo IN ('receita', 'despesa')) NOT NULL,
      data TEXT NOT NULL,
      hash_transacao TEXT UNIQUE
    );
  `);

  // 2. Tabela de Cabeçalho de Notas Fiscais (NFC-e)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave_acesso TEXT UNIQUE NOT NULL,
      estabelecimento TEXT NOT NULL,
      cnpj TEXT,
      data_emissao TEXT NOT NULL,
      valor_total REAL NOT NULL,
      desconto REAL DEFAULT 0.0
    );
  `);

  // 3. Tabela de Itens da Nota Fiscal
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

  // Migrações automáticas de colunas para tabelas pré-existentes
  const migracaoNotas = [
    'ALTER TABLE notas_fiscais ADD COLUMN data_emissao TEXT;',
    'ALTER TABLE notas_fiscais ADD COLUMN desconto REAL DEFAULT 0.0;'
  ];
  for (const sql of migracaoNotas) {
    try {
      await db.execute(sql);
    } catch (e) {
      // Ignora erro se coluna já existir
    }
  }

  const migracaoItens = [
    'ALTER TABLE itens_nota ADD COLUMN codigo TEXT;'
  ];
  for (const sql of migracaoItens) {
    try {
      await db.execute(sql);
    } catch (e) {
      // Ignora erro se coluna já existir
    }
  }

  console.log('✅ Banco de dados e tabelas inicializados com sucesso!');
}
