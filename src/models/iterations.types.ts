export const ITERATION_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'qa_failed',
  'cancelled',
] as const;

export type IterationStatus = (typeof ITERATION_STATUSES)[number];

export interface Iteration {
  id: string;
  story_id: string;
  iteration_number: number;
  status: IterationStatus;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateIterationInput {
  storyId: string;
  status?: IterationStatus;
  payload?: Record<string, unknown>;
}

export interface ListIterationsOptions {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}
