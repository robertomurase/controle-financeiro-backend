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

  // Migrações automáticas de colunas para bancos pré-existentes no Turso
  const colunasTransacoes = ['hash_transacao TEXT'];
  for (const col of colunasTransacoes) {
    try {
      await db.execute(`ALTER TABLE transacoes ADD COLUMN ${col}`);
    } catch (e) {
      // Ignora erro se a coluna já existir
    }
  }

  const colunasNotas = ['cnpj TEXT', 'data_emissao TEXT', 'desconto REAL DEFAULT 0.0'];
  for (const col of colunasNotas) {
    try {
      await db.execute(`ALTER TABLE notas_fiscais ADD COLUMN ${col}`);
    } catch (e) {
      // Ignora erro se a coluna já existir
    }
  }

  const colunasItens = ['codigo TEXT'];
  for (const col of colunasItens) {
    try {
      await db.execute(`ALTER TABLE itens_nota ADD COLUMN ${col}`);
    } catch (e) {
      // Ignora erro se a coluna já existir
    }
  }

  console.log('✅ Banco de dados e migrações de colunas inicializados com sucesso!');
}
