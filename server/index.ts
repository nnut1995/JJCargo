import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { migrate } from './db.js';
import { HttpError, requireAuth } from './auth.js';
import { crudRouter } from './crud.js';
import { publicRouter, coreRouter, loadUser } from './routes/core.js';
import { salesRouter } from './routes/sales.js';
import { logisticsRouter } from './routes/logistics.js';
import { financeRouter } from './routes/finance.js';

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.error('SESSION_SECRET must be set in production');
  process.exit(1);
}

migrate();

export const app = express();
app.use(express.json({ limit: '5mb' }));

// All route handlers are synchronous (node:sqlite is sync), so thrown HttpErrors reach the error handler below.
const api = express.Router();
api.use(publicRouter());
api.use(requireAuth(loadUser));
api.use(coreRouter());
api.use(crudRouter());
api.use(salesRouter());
api.use(logisticsRouter());
api.use(financeRouter());
app.use('/api', api);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : err?.type === 'entity.parse.failed' ? 400 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Server error: ' + (err?.message || err) : err.message });
});

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`JJ Cargo API on http://localhost:${port}`));
}
