import express from 'express';
import { healthRouter } from './routes';
import { routingRouter } from './routes/routing';
import { projectsRouter } from './routes/projects';
import { contextNodesRouter } from './routes/context-nodes';
import { contextEdgesRouter } from './routes/context-edges';
import { contextTasksRouter } from './routes/context-tasks';
import { seedStatusRouter } from './routes/seed-status';
import { graphsRouter } from './routes/graphs';

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

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
