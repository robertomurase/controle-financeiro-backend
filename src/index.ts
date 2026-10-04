import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './database.js';
import { router } from './routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota de Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Controle Financeiro API v8', timestamp: new Date().toISOString() });
});

// Registra as Rotas da API
app.use('/api', router);

async function bootstrap() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Falha ao inicializar servidor:', error);
    process.exit(1);
  }
}

bootstrap();
