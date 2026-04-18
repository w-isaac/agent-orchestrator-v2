import { describe, it, expect, vi } from 'vitest';
import { broadcastStoryUpdated, onStoryUpdated } from './storyBroadcaster';

describe('storyBroadcaster', () => {
  it('emits story.updated events with cause and payload', () => {
    const handler = vi.fn();
    const off = onStoryUpdated(handler);
    const story = { id: 's1', title: 'T' };
    broadcastStoryUpdated(story, 'advance');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({
      type: 'story.updated',
      payload: { story, cause: 'advance' },
    });
    off();
  });

  it('unsubscribes handlers when off() is called', () => {
    const handler = vi.fn();
    const off = onStoryUpdated(handler);
    off();
    broadcastStoryUpdated({ id: 's2' }, 'deps');
    expect(handler).not.toHaveBeenCalled();
  });
});
