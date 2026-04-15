import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapStoryStatus } from './status-mapper';

describe('mapStoryStatus', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('maps queued → queued', () => {
    expect(mapStoryStatus('queued')).toBe('queued');
  });

  it('maps in_progress → running', () => {
    expect(mapStoryStatus('in_progress')).toBe('running');
  });

  it('maps gate → pending_review', () => {
    expect(mapStoryStatus('gate')).toBe('pending_review');
  });

  it('maps done → completed', () => {
    expect(mapStoryStatus('done')).toBe('completed');
  });

  it('maps failed → failed', () => {
    expect(mapStoryStatus('failed')).toBe('failed');
  });

  it('returns unknown status unchanged and logs warning', () => {
    expect(mapStoryStatus('banana')).toBe('banana');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown v1 story status "banana"')
    );
  });

  it('does not warn for known statuses', () => {
    mapStoryStatus('queued');
    mapStoryStatus('done');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
