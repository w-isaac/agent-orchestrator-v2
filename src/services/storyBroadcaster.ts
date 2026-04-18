import { EventEmitter } from 'events';

export type StoryLifecycleCause =
  | 'advance'
  | 'retreat'
  | 'approve'
  | 'deps'
  | 'prioritize';

export interface StoryUpdatedEvent {
  type: 'story.updated';
  payload: {
    story: Record<string, unknown>;
    cause: StoryLifecycleCause;
  };
}

const emitter = new EventEmitter();

export function broadcastStoryUpdated(
  story: Record<string, unknown>,
  cause: StoryLifecycleCause,
): StoryUpdatedEvent {
  const event: StoryUpdatedEvent = { type: 'story.updated', payload: { story, cause } };
  emitter.emit('story.updated', event);
  return event;
}

export function onStoryUpdated(handler: (event: StoryUpdatedEvent) => void): () => void {
  emitter.on('story.updated', handler);
  return () => emitter.off('story.updated', handler);
}
