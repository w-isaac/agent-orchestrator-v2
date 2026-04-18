import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { NodeEditModal } = require('../js/node-edit-modal');

function mockResponse(ok, bodyJson, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(bodyJson),
  };
}

describe('NodeEditModal', () => {
  describe('validateLabel', () => {
    it('requires a non-empty label', () => {
      expect(NodeEditModal.validateLabel('')).toBe('Label is required');
      expect(NodeEditModal.validateLabel('   ')).toBe('Label is required');
      expect(NodeEditModal.validateLabel(null)).toBe('Label is required');
    });

    it('accepts a normal label', () => {
      expect(NodeEditModal.validateLabel('Concept')).toBeNull();
    });

    it('rejects labels over LABEL_MAX', () => {
      const long = 'x'.repeat(NodeEditModal.LABEL_MAX + 1);
      expect(NodeEditModal.validateLabel(long)).toMatch(/characters/);
    });
  });

  describe('serializeProperties', () => {
    it('converts rows to an object', () => {
      const result = NodeEditModal.serializeProperties([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]);
      expect(result).toEqual({ a: '1', b: '2' });
    });

    it('skips rows with empty keys', () => {
      const result = NodeEditModal.serializeProperties([
        { key: '', value: 'ignored' },
        { key: '  ', value: 'also ignored' },
        { key: 'k', value: 'v' },
      ]);
      expect(result).toEqual({ k: 'v' });
    });

    it('returns empty object for non-array input', () => {
      expect(NodeEditModal.serializeProperties(null)).toEqual({});
      expect(NodeEditModal.serializeProperties(undefined)).toEqual({});
    });

    it('coerces values to strings', () => {
      const result = NodeEditModal.serializeProperties([{ key: 'x', value: 42 }]);
      expect(result).toEqual({ x: '42' });
    });

    it('later duplicate keys overwrite earlier ones', () => {
      const result = NodeEditModal.serializeProperties([
        { key: 'k', value: 'first' },
        { key: 'k', value: 'second' },
      ]);
      expect(result).toEqual({ k: 'second' });
    });
  });

  describe('deserializeProperties', () => {
    it('converts an object to rows', () => {
      const rows = NodeEditModal.deserializeProperties({ a: '1', b: '2' });
      expect(rows).toEqual([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]);
    });

    it('returns empty array for falsy input', () => {
      expect(NodeEditModal.deserializeProperties(null)).toEqual([]);
      expect(NodeEditModal.deserializeProperties(undefined)).toEqual([]);
    });
  });

  describe('buildPayload', () => {
    it('builds a POST-ready payload', () => {
      const payload = NodeEditModal.buildPayload({
        label: '  Hello  ',
        type: 'artifact',
        properties: [{ key: 'k', value: 'v' }],
      });
      expect(payload).toEqual({
        label: 'Hello',
        type: 'artifact',
        properties: { k: 'v' },
      });
    });

    it('defaults type to concept', () => {
      const payload = NodeEditModal.buildPayload({ label: 'x' });
      expect(payload.type).toBe('concept');
    });
  });

  describe('save', () => {
    it('POSTs to create endpoint when no nodeId', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(true, { id: 'new-id', label: 'hi' }, 201));
      const result = await NodeEditModal.save({
        projectId: 'proj-1',
        form: { label: 'hi', type: 'concept', properties: [] },
        fetch: fetchMock,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/context-graph/proj-1/nodes',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ label: 'hi', type: 'concept', properties: {} });
      expect(result).toEqual({ id: 'new-id', label: 'hi' });
    });

    it('PATCHes to edit endpoint when nodeId is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(true, { id: 'n1', label: 'updated' }));
      await NodeEditModal.save({
        projectId: 'proj-1',
        nodeId: 'n1',
        form: { label: 'updated', type: 'concept', properties: [] },
        fetch: fetchMock,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/context-graph/nodes/n1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('rejects when label is empty', async () => {
      const fetchMock = vi.fn();
      await expect(NodeEditModal.save({
        projectId: 'p',
        form: { label: '' },
        fetch: fetchMock,
      })).rejects.toThrow(/Label/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects on non-OK response with server error', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(false, { error: 'bad request' }, 400));
      await expect(NodeEditModal.save({
        projectId: 'p',
        form: { label: 'x', type: 'concept', properties: [] },
        fetch: fetchMock,
      })).rejects.toThrow('bad request');
    });

    it('requires projectId on create', async () => {
      const fetchMock = vi.fn();
      await expect(NodeEditModal.save({
        form: { label: 'x' },
        fetch: fetchMock,
      })).rejects.toThrow(/projectId/);
    });
  });
});
