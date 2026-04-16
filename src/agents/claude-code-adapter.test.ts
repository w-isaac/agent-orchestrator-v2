import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ClaudeCodeAdapter, TaskStatus } from './claude-code-adapter';

/** Minimal mock that behaves like a ChildProcess. */
function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.pid = 12345;
  proc.kill = vi.fn((signal?: string) => {
    if (signal === 'SIGKILL') {
      proc.killed = true;
    }
    return true;
  });
  return proc;
}

describe('ClaudeCodeAdapter', () => {
  let mockProc: ReturnType<typeof createMockProcess>;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    mockProc = createMockProcess();
    mockSpawn = vi.fn().mockReturnValue(mockProc);
    adapter = new ClaudeCodeAdapter(mockSpawn as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('submit', () => {
    it('spawns claude with --print and bypassPermissions flags', () => {
      const handle = adapter.submit({ prompt: 'do something' });

      expect(mockSpawn).toHaveBeenCalledOnce();
      const [cmd, args, opts] = mockSpawn.mock.calls[0];
      expect(cmd).toBe('claude');
      expect(args).toContain('--print');
      expect(args).toContain('do something');
      expect(args).toContain('--permission-mode');
      expect(args).toContain('bypassPermissions');
      expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe']);
      expect(handle.taskId).toBeDefined();
    });

    it('returns a task handle with running status', () => {
      const handle = adapter.submit({ prompt: 'test' });

      expect(handle.status).toBe('running');
      expect(handle.taskId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(handle.createdAt).toBeDefined();
      expect(handle.process).toBe(mockProc);
    });

    it('passes cwd option when provided', () => {
      adapter.submit({ prompt: 'test', cwd: '/my/project' });

      const [, , opts] = mockSpawn.mock.calls[0];
      expect(opts.cwd).toBe('/my/project');
    });

    it('includes --model flag when model is specified', () => {
      adapter.submit({ prompt: 'test', model: 'claude-opus-4-20250514' });

      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4-20250514');
    });

    it('collects stdout into output', () => {
      const handle = adapter.submit({ prompt: 'test' });

      mockProc.stdout.emit('data', Buffer.from('hello '));
      mockProc.stdout.emit('data', Buffer.from('world'));

      expect(handle.output).toBe('hello world');
    });

    it('sets status to completed on exit code 0', () => {
      const handle = adapter.submit({ prompt: 'test' });

      mockProc.emit('close', 0);
      expect(handle.status).toBe('completed');
    });

    it('sets status to failed on non-zero exit code', () => {
      const handle = adapter.submit({ prompt: 'test' });

      mockProc.emit('close', 1);
      expect(handle.status).toBe('failed');
    });

    it('sets status to failed on process error', () => {
      const handle = adapter.submit({ prompt: 'test' });

      mockProc.emit('error', new Error('spawn ENOENT'));
      expect(handle.status).toBe('failed');
    });
  });

  describe('checkStatus', () => {
    it('returns running for an active task', () => {
      const handle = adapter.submit({ prompt: 'test' });
      expect(adapter.checkStatus(handle.taskId)).toBe('running');
    });

    it('returns completed after process exits with code 0', () => {
      const handle = adapter.submit({ prompt: 'test' });
      mockProc.emit('close', 0);
      expect(adapter.checkStatus(handle.taskId)).toBe('completed');
    });

    it('returns failed after process exits with non-zero code', () => {
      const handle = adapter.submit({ prompt: 'test' });
      mockProc.emit('close', 1);
      expect(adapter.checkStatus(handle.taskId)).toBe('failed');
    });

    it('returns cancelled after cancel is called', () => {
      const handle = adapter.submit({ prompt: 'test' });
      adapter.cancel(handle.taskId);
      expect(adapter.checkStatus(handle.taskId)).toBe('cancelled');
    });

    it('throws for unknown task ID', () => {
      expect(() => adapter.checkStatus('nonexistent')).toThrow('Unknown task: nonexistent');
    });
  });

  describe('cancel', () => {
    it('sends SIGTERM to the process', () => {
      const handle = adapter.submit({ prompt: 'test' });
      adapter.cancel(handle.taskId);

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('updates status to cancelled', () => {
      const handle = adapter.submit({ prompt: 'test' });
      adapter.cancel(handle.taskId);

      expect(handle.status).toBe('cancelled');
    });

    it('does not change status if process close event fires after cancel', () => {
      const handle = adapter.submit({ prompt: 'test' });
      adapter.cancel(handle.taskId);
      mockProc.emit('close', 0);

      // Status stays cancelled, not overwritten to completed
      expect(handle.status).toBe('cancelled');
    });

    it('does not change status if process error fires after cancel', () => {
      const handle = adapter.submit({ prompt: 'test' });
      adapter.cancel(handle.taskId);
      mockProc.emit('error', new Error('killed'));

      expect(handle.status).toBe('cancelled');
    });

    it('sends SIGKILL after 3s if process is still alive', () => {
      const handle = adapter.submit({ prompt: 'test' });
      adapter.cancel(handle.taskId);

      expect(mockProc.kill).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(3000);

      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
      expect(handle.status).toBe('terminated');
    });

    it('clears SIGKILL timer if process exits before timeout', () => {
      const handle = adapter.submit({ prompt: 'test' });
      adapter.cancel(handle.taskId);

      // Process exits before 3s timeout
      mockProc.emit('close', null);
      vi.advanceTimersByTime(3000);

      // SIGKILL should not have been sent (only SIGTERM)
      expect(mockProc.kill).toHaveBeenCalledTimes(1);
      expect(handle.status).toBe('cancelled');
    });

    it('is a no-op for already completed tasks', () => {
      const handle = adapter.submit({ prompt: 'test' });
      mockProc.emit('close', 0);

      adapter.cancel(handle.taskId);

      expect(mockProc.kill).not.toHaveBeenCalled();
      expect(handle.status).toBe('completed');
    });

    it('is a no-op for already failed tasks', () => {
      const handle = adapter.submit({ prompt: 'test' });
      mockProc.emit('close', 1);

      adapter.cancel(handle.taskId);

      expect(mockProc.kill).not.toHaveBeenCalled();
      expect(handle.status).toBe('failed');
    });

    it('throws for unknown task ID', () => {
      expect(() => adapter.cancel('nonexistent')).toThrow('Unknown task: nonexistent');
    });
  });
});
