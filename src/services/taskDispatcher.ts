import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { ClaudeCodeAdapter, TaskPayload, TaskStatus as AdapterStatus } from '../agents/claude-code-adapter';

export type TaskStatus = 'queued' | 'dispatched' | 'running' | 'validating' | 'complete' | 'invalid' | 'failed';

export interface TaskRecord {
  id: string;
  type: string;
  payload: string;
  priority: string;
  timeout_seconds: number | null;
  status: TaskStatus;
  output: string | null;
  validation_error: string | null;
  error_code: string | null;
  error_message: string | null;
  error_stack: string | null;
  adapter_response: string | null;
  source_task_id: string | null;
  retry_count: number;
  last_polled_at: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
}

export interface SubmitTaskInput {
  type: string;
  payload: TaskPayload;
  priority?: string;
  timeout_seconds?: number;
  submitted_by?: string;
  source_task_id?: string;
}

export type OutputValidator = (output: string) => { valid: boolean; error?: string };

/**
 * Default validator: checks output is non-empty.
 */
export function defaultValidator(output: string): { valid: boolean; error?: string } {
  if (!output || output.trim().length === 0) {
    return { valid: false, error: 'Output is empty' };
  }
  return { valid: true };
}

export class TaskDispatcher {
  #pool: Pool;
  #adapter: ClaudeCodeAdapter;
  #validator: OutputValidator;
  #pollIntervalMs: number;
  #activePolls = new Map<string, ReturnType<typeof setTimeout>>();
  #adapterTaskIds = new Map<string, string>();

  constructor(
    pool: Pool,
    adapter: ClaudeCodeAdapter,
    options?: {
      validator?: OutputValidator;
      pollIntervalMs?: number;
    },
  ) {
    this.#pool = pool;
    this.#adapter = adapter;
    this.#validator = options?.validator ?? defaultValidator;
    this.#pollIntervalMs = options?.pollIntervalMs ?? 2000;
  }

  /**
   * Submit a new task: persist to DB, dispatch to adapter, begin polling.
   */
  async submit(input: SubmitTaskInput): Promise<TaskRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const task: TaskRecord = {
      id,
      type: input.type,
      payload: JSON.stringify(input.payload),
      priority: input.priority ?? 'normal',
      timeout_seconds: input.timeout_seconds ?? null,
      status: 'queued',
      output: null,
      validation_error: null,
      error_code: null,
      error_message: null,
      error_stack: null,
      adapter_response: null,
      source_task_id: input.source_task_id ?? null,
      retry_count: 0,
      last_polled_at: null,
      submitted_by: input.submitted_by ?? null,
      created_at: now,
      updated_at: now,
      dispatched_at: null,
      completed_at: null,
    };

    await this.#pool.query(
      `INSERT INTO tasks (id, type, payload, priority, timeout_seconds, status, source_task_id, retry_count, submitted_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [task.id, task.type, task.payload, task.priority, task.timeout_seconds, task.status, task.source_task_id, task.retry_count, task.submitted_by, task.created_at, task.updated_at],
    );

    // Dispatch to adapter
    try {
      const handle = this.#adapter.submit(input.payload);
      this.#adapterTaskIds.set(task.id, handle.taskId);
      task.status = 'dispatched';
      task.dispatched_at = new Date().toISOString();
      await this.#updateTask(task.id, { status: 'dispatched', dispatched_at: task.dispatched_at });
    } catch (err) {
      const error = err as Error;
      task.status = 'failed';
      task.error_code = 'DISPATCH_ERROR';
      task.error_message = error.message;
      task.error_stack = error.stack ?? null;
      task.completed_at = new Date().toISOString();
      await this.#updateTask(task.id, {
        status: 'failed',
        error_code: 'DISPATCH_ERROR',
        error_message: error.message,
        error_stack: error.stack ?? null,
        completed_at: task.completed_at,
      });
      return task;
    }

    // Start polling
    this.#startPolling(task.id);

    return task;
  }

  /**
   * Get a task by ID.
   */
  async getTask(id: string): Promise<TaskRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return (rows[0] as TaskRecord) ?? null;
  }

  /**
   * List tasks with optional filters.
   */
  async listTasks(filters?: { status?: string; type?: string; limit?: number; offset?: number }): Promise<TaskRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters?.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(filters.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const { rows } = await this.#pool.query(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limit, offset],
    );
    return rows as TaskRecord[];
  }

  /**
   * Retry a failed task by creating a new task linked to the original.
   */
  async retry(taskId: string): Promise<TaskRecord> {
    const original = await this.getTask(taskId);
    if (!original) {
      throw new Error(`Task not found: ${taskId}`);
    }
    if (original.status !== 'failed' && original.status !== 'invalid') {
      throw new Error(`Cannot retry task in status: ${original.status}`);
    }

    const payload = JSON.parse(original.payload) as TaskPayload;
    return this.submit({
      type: original.type,
      payload,
      priority: original.priority,
      timeout_seconds: original.timeout_seconds ?? undefined,
      submitted_by: original.submitted_by ?? undefined,
      source_task_id: original.id,
    });
  }

  /**
   * Stop all active polling loops.
   */
  stopAll(): void {
    for (const timer of this.#activePolls.values()) {
      clearTimeout(timer);
    }
    this.#activePolls.clear();
  }

  // --- Internal ---

  #startPolling(taskId: string): void {
    const poll = async () => {
      try {
        const task = await this.getTask(taskId);
        if (!task || task.status === 'failed' || task.status === 'complete' || task.status === 'invalid') {
          this.#activePolls.delete(taskId);
          return;
        }

        const adapterTaskId = this.#adapterTaskIds.get(taskId);
        let adapterStatus: AdapterStatus;
        try {
          adapterStatus = this.#adapter.checkStatus(adapterTaskId!);
        } catch {
          adapterStatus = 'running';
        }

        const now = new Date().toISOString();
        await this.#updateTask(taskId, { last_polled_at: now });

        if (adapterStatus === 'running' && task.status === 'dispatched') {
          await this.#updateTask(taskId, { status: 'running' });
        }

        if (adapterStatus === 'completed') {
          await this.#handleCompletion(taskId, adapterTaskId!);
          this.#activePolls.delete(taskId);
          return;
        }

        if (adapterStatus === 'failed') {
          await this.#handleFailure(taskId, 'ADAPTER_FAILURE', 'Adapter reported failure');
          this.#activePolls.delete(taskId);
          return;
        }

        // Continue polling
        const timer = setTimeout(poll, this.#pollIntervalMs);
        this.#activePolls.set(taskId, timer);
      } catch (err) {
        await this.#handleFailure(taskId, 'POLL_ERROR', (err as Error).message);
        this.#activePolls.delete(taskId);
      }
    };

    const timer = setTimeout(poll, this.#pollIntervalMs);
    this.#activePolls.set(taskId, timer);
  }

  async #handleCompletion(taskId: string, adapterTaskId: string): Promise<void> {
    const handle = this.#adapter.getTask(adapterTaskId);
    const output = handle?.output ?? '';

    await this.#updateTask(taskId, { status: 'validating', output });

    const result = this.#validator(output);
    const now = new Date().toISOString();

    if (result.valid) {
      await this.#updateTask(taskId, { status: 'complete', completed_at: now });
    } else {
      await this.#updateTask(taskId, {
        status: 'invalid',
        validation_error: result.error ?? 'Validation failed',
        completed_at: now,
      });
    }
  }

  async #handleFailure(taskId: string, errorCode: string, errorMessage: string): Promise<void> {
    const now = new Date().toISOString();
    await this.#updateTask(taskId, {
      status: 'failed',
      error_code: errorCode,
      error_message: errorMessage,
      completed_at: now,
    });
  }

  async #updateTask(id: string, fields: Partial<TaskRecord>): Promise<void> {
    const sets: string[] = ['updated_at = $1'];
    const params: any[] = [new Date().toISOString()];
    let idx = 2;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'id' || key === 'updated_at') continue;
      sets.push(`${key} = $${idx++}`);
      params.push(value ?? null);
    }

    params.push(id);
    await this.#pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${idx}`,
      params,
    );
  }
}
