import express from 'express';
import { healthRouter } from './routes';
import { routingRouter } from './routes/routing';

const app = express();

app.use(express.json());
app.use(healthRouter);
app.use(routingRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
