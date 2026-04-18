import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { EdgeEditModal } = require('../js/edge-edit-modal');

function mockResponse(ok, bodyJson, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(bodyJson),
  };
}

describe('EdgeEditModal', () => {
  describe('validateLabel', () => {
    it('requires a non-empty label', () => {
      expect(EdgeEditModal.validateLabel('')).toBe('Label is required');
      expect(EdgeEditModal.validateLabel('   ')).toBe('Label is required');
    });

    it('accepts a normal label', () => {
      expect(EdgeEditModal.validateLabel('relates')).toBeNull();
    });

    it('rejects labels over LABEL_MAX', () => {
      const long = 'x'.repeat(EdgeEditModal.LABEL_MAX + 1);
      expect(EdgeEditModal.validateLabel(long)).toMatch(/characters/);
    });
  });

  describe('buildPayload', () => {
    it('trims label and defaults type', () => {
      const payload = EdgeEditModal.buildPayload({ label: '  relates  ' });
      expect(payload).toEqual({ label: 'relates', type: 'relates_to' });
    });

    it('preserves explicit type', () => {
      const payload = EdgeEditModal.buildPayload({ label: 'depends', type: 'depends_on' });
      expect(payload.type).toBe('depends_on');
    });
  });

  describe('save', () => {
    it('POSTs to create endpoint with source/target', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(true, { id: 'e1' }, 201));
      await EdgeEditModal.save({
        projectId: 'p1',
        sourceId: 's1',
        targetId: 't1',
        form: { label: 'rel', type: 'relates_to' },
        fetch: fetchMock,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/context-graph/p1/edges',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({
        source_node_id: 's1',
        target_node_id: 't1',
        label: 'rel',
        type: 'relates_to',
      });
    });

    it('PATCHes to edit endpoint when edgeId is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(true, { id: 'e1' }));
      await EdgeEditModal.save({
        edgeId: 'e1',
        form: { label: 'updated', type: 'blocks' },
        fetch: fetchMock,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/context-graph/edges/e1',
        expect.objectContaining({ method: 'PATCH' }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ label: 'updated', type: 'blocks' });
    });

    it('rejects self-edges on create', async () => {
      const fetchMock = vi.fn();
      await expect(EdgeEditModal.save({
        projectId: 'p',
        sourceId: 'n1',
        targetId: 'n1',
        form: { label: 'x' },
        fetch: fetchMock,
      })).rejects.toThrow(/differ/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects when label is empty', async () => {
      const fetchMock = vi.fn();
      await expect(EdgeEditModal.save({
        projectId: 'p',
        sourceId: 'a',
        targetId: 'b',
        form: { label: '' },
        fetch: fetchMock,
      })).rejects.toThrow(/Label/);
    });

    it('requires source and target on create', async () => {
      const fetchMock = vi.fn();
      await expect(EdgeEditModal.save({
        projectId: 'p',
        form: { label: 'x' },
        fetch: fetchMock,
      })).rejects.toThrow(/source/);
    });

    it('surfaces server error message on non-OK response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(false, { error: 'edge exists' }, 422));
      await expect(EdgeEditModal.save({
        projectId: 'p',
        sourceId: 'a',
        targetId: 'b',
        form: { label: 'x', type: 'relates_to' },
        fetch: fetchMock,
      })).rejects.toThrow('edge exists');
    });
  });
});
