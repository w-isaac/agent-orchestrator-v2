import { describe, it, expect } from 'vitest';
import { getParentPath, resolveParentArtifact } from './directoryResolver';

describe('getParentPath', () => {
  it('returns parent directory', () => {
    expect(getParentPath('/src/lib/utils.ts')).toBe('/src/lib');
  });

  it('returns null for root-level files', () => {
    expect(getParentPath('/file.ts')).toBeNull();
  });

  it('returns null for empty path', () => {
    expect(getParentPath('')).toBeNull();
  });

  it('returns null for root', () => {
    expect(getParentPath('/')).toBeNull();
  });

  it('handles trailing slashes', () => {
    expect(getParentPath('/src/lib/')).toBe('/src');
  });

  it('handles nested paths', () => {
    expect(getParentPath('/a/b/c/d')).toBe('/a/b/c');
  });
});

describe('resolveParentArtifact', () => {
  it('finds parent artifact by path', () => {
    const pathMap = new Map([
      ['/src/lib', 'parent-id'],
      ['/src', 'grandparent-id'],
    ]);
    const result = resolveParentArtifact('/src/lib/utils.ts', pathMap);
    expect(result).toEqual({ parentPath: '/src/lib', parentId: 'parent-id' });
  });

  it('returns null when no parent exists in map', () => {
    const pathMap = new Map([
      ['/other', 'other-id'],
    ]);
    expect(resolveParentArtifact('/src/lib/utils.ts', pathMap)).toBeNull();
  });

  it('returns null for root-level file', () => {
    const pathMap = new Map<string, string>();
    expect(resolveParentArtifact('/file.ts', pathMap)).toBeNull();
  });
});
