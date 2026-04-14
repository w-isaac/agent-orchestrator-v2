import express from 'express';
import { healthRouter } from './routes';

const app = express();

app.use(express.json());
app.use(healthRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
