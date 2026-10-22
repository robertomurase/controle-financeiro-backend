import express from 'express';
import cors from 'cors';
import routes from './routes';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({ status: 'API Controle Financeiro Backend v100 - Reset Clean', timestamp: new Date() });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port} - Backend v100 Clean`);
});
