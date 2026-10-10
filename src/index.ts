import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router } from './routes.js';
import { initDb } from './database.js';

// Polyfill para serialização de BigInt no JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// Rotas da API
app.use('/api', router);

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', service: 'Controle Financeiro API v30' });
});

// Inicialização
async function startServer() {
  try {
    await initDb();
    app.listen(port, () => {
      console.log(`🚀 Servidor rodando na porta ${port} - API v30`);
    });
  } catch (error) {
    console.error('❌ Erro crítico ao iniciar o servidor:', error);
    process.exit(1);
  }
}

startServer();
