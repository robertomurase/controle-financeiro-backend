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
  await db.execute();

  // 2. Tabela de Cabeçalho de Notas Fiscais (NFC-e)
  await db.execute();

  // 3. Tabela de Itens da Nota Fiscal
  await db.execute();

  // Migrações automáticas de colunas para bancos pré-existentes no Turso
  const colunasNotas = ['data_emissao TEXT', 'desconto REAL DEFAULT 0.0'];
  for (const col of colunasNotas) {
    try {
      await db.execute();
    } catch (e) {}
  }

  const colunasItens = ['codigo TEXT'];
  for (const col of colunasItens) {
    try {
      await db.execute();
    } catch (e) {}
  }

  // Tenta criar índices
  try {
    await db.execute();
  } catch (e) {}

  try {
    await db.execute();
  } catch (e) {}

  console.log('✅ Banco de dados e tabelas inicializados com sucesso!');
}
