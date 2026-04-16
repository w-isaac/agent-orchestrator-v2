import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'terminated';

export interface TaskHandle {
  taskId: string;
  process: ChildProcess | null;
  status: TaskStatus;
  createdAt: string;
  output: string;
}

export interface TaskPayload {
  prompt: string;
  cwd?: string;
  model?: string;
  sessionId?: string;
}

/**
 * ClaudeCodeAdapter wraps child_process.spawn to manage Claude Code CLI
 * process lifecycle: submit, checkStatus, cancel.
 */
export class ClaudeCodeAdapter {
  #tasks = new Map<string, TaskHandle>();
  #killTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #spawnFn: typeof spawn;

  constructor(spawnFn?: typeof spawn) {
    this.#spawnFn = spawnFn ?? spawn;
  }

  /**
   * Spawn a Claude Code process with MCP enabled.
   */
  submit(payload: TaskPayload): TaskHandle {
    const taskId = randomUUID();
    const args = [
      '--print', payload.prompt,
      '--permission-mode', 'bypassPermissions',
    ];
    if (payload.model) {
      args.push('--model', payload.model);
    }

    const proc = this.#spawnFn('claude', args, {
      cwd: payload.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const handle: TaskHandle = {
      taskId,
      process: proc,
      status: 'running',
      createdAt: new Date().toISOString(),
      output: '',
    };

    if (proc.stdout) {
      proc.stdout.on('data', (chunk: Buffer) => {
        handle.output += chunk.toString();
      });
    }

    proc.on('close', (code) => {
      if (handle.status === 'cancelled' || handle.status === 'terminated') return;
      handle.status = code === 0 ? 'completed' : 'failed';
    });

    proc.on('error', () => {
      if (handle.status === 'cancelled' || handle.status === 'terminated') return;
      handle.status = 'failed';
    });

    this.#tasks.set(taskId, handle);
    return handle;
  }

  /**
   * Return current execution state for a task handle.
   */
  checkStatus(taskId: string): TaskStatus {
    const handle = this.#tasks.get(taskId);
    if (!handle) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    return handle.status;
  }

  /**
   * Gracefully terminate the Claude Code process (SIGTERM -> SIGKILL fallback).
   */
  cancel(taskId: string): void {
    const handle = this.#tasks.get(taskId);
    if (!handle) {
      throw new Error(`Unknown task: ${taskId}`);
    }
    if (handle.status !== 'running') {
      return;
    }

    handle.status = 'cancelled';
    if (handle.process) {
      handle.process.kill('SIGTERM');

      const killTimer = setTimeout(() => {
        if (handle.process && !handle.process.killed) {
          handle.process.kill('SIGKILL');
          handle.status = 'terminated';
        }
        this.#killTimers.delete(taskId);
      }, 3000);

      this.#killTimers.set(taskId, killTimer);

      handle.process.on('close', () => {
        const timer = this.#killTimers.get(taskId);
        if (timer) {
          clearTimeout(timer);
          this.#killTimers.delete(taskId);
        }
      });
    }
  }

  /**
   * Get the task handle (for testing/internal use).
   */
  getTask(taskId: string): TaskHandle | undefined {
    return this.#tasks.get(taskId);
  }
}
