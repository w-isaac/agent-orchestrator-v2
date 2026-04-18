import { z } from 'zod';

export const portSchema = z
  .number()
  .int()
  .finite()
  .min(1)
  .max(65535)
  .nullable();

export type Port = z.infer<typeof portSchema>;
