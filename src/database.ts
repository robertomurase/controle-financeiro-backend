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
  console.log('🔄 Inicializando e verificando schema do Turso v20...');

  // 1. Tabela de Transações
  await db.execute();

  // 2. Tabela de Notas Fiscais
  await db.execute();

  // 3. Tabela de Itens da Nota
  await db.execute();

  // 4. Tabela de Mapeamento de Estabelecimentos (De-Para)
  await db.execute();

  // Migrações explícitas de colunas
  const migracoes = [
    { t: 'transacoes', c: 'hash_transacao', sql: 'ALTER TABLE transacoes ADD COLUMN hash_transacao TEXT' },
    { t: 'transacoes', c: 'conta', sql: "ALTER TABLE transacoes ADD COLUMN conta TEXT DEFAULT 'Conta Corrente'" },
    { t: 'transacoes', c: 'quantidade', sql: 'ALTER TABLE transacoes ADD COLUMN quantidade REAL DEFAULT 1.0' },
    { t: 'transacoes', c: 'valor_unitario', sql: 'ALTER TABLE transacoes ADD COLUMN valor_unitario REAL' },
    { t: 'transacoes', c: 'estabelecimento', sql: 'ALTER TABLE transacoes ADD COLUMN estabelecimento TEXT' },
    { t: 'notas_fiscais', c: 'cnpj', sql: 'ALTER TABLE notas_fiscais ADD COLUMN cnpj TEXT' },
    { t: 'notas_fiscais', c: 'data_emissao', sql: 'ALTER TABLE notas_fiscais ADD COLUMN data_emissao TEXT' },
    { t: 'notas_fiscais', c: 'desconto', sql: 'ALTER TABLE notas_fiscais ADD COLUMN desconto REAL DEFAULT 0.0' },
    { t: 'itens_nota', c: 'nota_fiscal_id', sql: 'ALTER TABLE itens_nota ADD COLUMN nota_fiscal_id INTEGER' },
    { t: 'itens_nota', c: 'codigo', sql: 'ALTER TABLE itens_nota ADD COLUMN codigo TEXT' },
    { t: 'itens_nota', c: 'data_emissao', sql: 'ALTER TABLE itens_nota ADD COLUMN data_emissao TEXT' },
    { t: 'itens_nota', c: 'data_cadastro', sql: 'ALTER TABLE itens_nota ADD COLUMN data_cadastro TEXT' },
    { t: 'itens_nota', c: 'estabelecimento', sql: 'ALTER TABLE itens_nota ADD COLUMN estabelecimento TEXT' },
  ];

  for (const m of migracoes) {
    try {
      await db.execute(m.sql);
    } catch (e: any) {}
  }

  // Índices
  try {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_transacoes_hash ON transacoes(hash_transacao)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_notas_chave ON notas_fiscais(chave_acesso)');
  } catch (e) {}

  console.log('✅ Banco de dados v20 pronto com mapeamento de estabelecimentos!');
}
