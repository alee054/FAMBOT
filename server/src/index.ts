import express from 'express';
import path from 'path';
import fs from 'fs';
import { migrate } from './db';
import { authMiddleware } from './auth';
import { startScheduler } from './scheduler';
import users from './routes/users';
import liste from './routes/liste';
import promemoria from './routes/promemoria';
import bacheca from './routes/bacheca';

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const auth = authMiddleware();
app.use('/api/users', auth, users);
app.use('/api/liste', auth, liste);
app.use('/api/promemoria', auth, promemoria);
app.use('/api/bacheca', auth, bacheca);

// Frontend statico (build di Vite) + fallback SPA.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] errore:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

const port = Number(process.env.PORT) || 3000;

migrate()
  .then(() => {
    app.listen(port, () => console.log(`[server] in ascolto su porta ${port}`));
    startScheduler();
  })
  .catch((err) => {
    console.error('[server] migration fallita:', err);
    process.exit(1);
  });
