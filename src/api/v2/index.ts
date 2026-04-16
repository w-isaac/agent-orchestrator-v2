import { Router } from 'express';
import { v2ProjectsRouter } from './projects';
import { v2TasksRouter } from './tasks';

export const v2Router = Router();

v2Router.use(v2ProjectsRouter);
v2Router.use(v2TasksRouter);
