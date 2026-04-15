import express from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { healthRouter } from './routes';
import { routingRouter } from './routes/routing';
import { projectsRouter } from './routes/projects';
import { contextNodesRouter } from './routes/context-nodes';
import { contextEdgesRouter } from './routes/context-edges';
import { contextTasksRouter } from './routes/context-tasks';
import { seedStatusRouter } from './routes/seed-status';
import { graphsRouter } from './routes/graphs';
import { contextRetrievalRouter } from './routes/context-retrieval';

const app = express();

app.use(express.json());
app.use(healthRouter);
app.use(routingRouter);
app.use(projectsRouter);
app.use(contextNodesRouter);
app.use(contextEdgesRouter);
app.use(contextTasksRouter);
app.use(seedStatusRouter);
app.use(graphsRouter);
app.use(contextRetrievalRouter);

// Static file serving: prefer built SPA in client/dist/, fall back to client/ scaffold
const clientDir = join(__dirname, '../client');
const clientDist = join(clientDir, 'dist');

if (existsSync(join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
} else if (existsSync(join(clientDir, 'index.html'))) {
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(join(clientDir, 'index.html')));
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

export default app;
