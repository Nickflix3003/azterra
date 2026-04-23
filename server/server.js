import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes/index.js';
import { loadEnv, getConfig } from './config/env.js';
import { ensureDefaultAdmin } from './utils.js';
import cookieParser from 'cookie-parser';
import { authRequired } from './utils.js';

loadEnv();

const { port, allowedOrigins } = getConfig();
const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || ''));

app.get('/', (req, res) => res.send('API up 🟢'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'ok', usersSeeded: true });
});

app.get('/api/hello', authRequired, (req, res) => {
  res.json({ message: 'Hello from Azterra API', user: req.user });
});

registerRoutes(app);

await ensureDefaultAdmin();

app.listen(port, '0.0.0.0', () => {
  console.log(`Azterra backend listening on port ${port}`);
});
