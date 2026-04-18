import { z } from 'zod';
import { portSchema } from './portSchema';

export const PORT_FIELDS = ['deploy_port', 'frontend_port', 'backend_port', 'container_port'] as const;
export type PortField = (typeof PORT_FIELDS)[number];

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  deploy_port: portSchema.optional(),
  frontend_port: portSchema.optional(),
  backend_port: portSchema.optional(),
  container_port: portSchema.optional(),
});

export const patchProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  deploy_port: portSchema.optional(),
  frontend_port: portSchema.optional(),
  backend_port: portSchema.optional(),
  container_port: portSchema.optional(),
  auto_approve: z.boolean().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;
