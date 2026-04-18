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
import { promptBuilderRouter } from './routes/prompt-builder';
import { adaptersRouter } from './routes/adapters';
import { ingestionRouter } from './routes/ingestion';
import { graphRouter } from './routes/graph';
import { tasksRouter } from './routes/tasks';
import { storiesRouter } from './routes/stories';
import { storyLifecycleRouter } from './routes/story-lifecycle';
import { contextGraphRouter } from './routes/context-graph';
import { contextNodesCrudRouter } from './routes/context-nodes-crud';
import { taskLifecycleRouter } from './routes/task-lifecycle';
import { usageRouter } from './routes/usage';
import { subTasksRouter } from './routes/sub-tasks';
import { conflictLogRouter } from './routes/conflict-log';
import { conflictsRouter } from './routes/conflicts';
import { analyticsRouter } from './routes/analytics';
import { v2Router } from './api/v2';
import { tasksRouter as apiTasksRouter } from './api/tasks';

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
app.use(promptBuilderRouter);
app.use(adaptersRouter);
app.use(ingestionRouter);
app.use(graphRouter);
app.use(tasksRouter);
app.use(storyLifecycleRouter);
app.use(storiesRouter);
app.use(contextGraphRouter);
app.use(contextNodesCrudRouter);
app.use(taskLifecycleRouter);
app.use(usageRouter);
app.use(subTasksRouter);
app.use(conflictLogRouter);
app.use(conflictsRouter);
app.use(analyticsRouter);
app.use(v2Router);
app.use(apiTasksRouter);

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
