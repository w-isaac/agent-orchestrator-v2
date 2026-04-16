import { Router } from 'express';
import { v2ProjectsRouter } from './projects';

export const v2Router = Router();

v2Router.use(v2ProjectsRouter);
