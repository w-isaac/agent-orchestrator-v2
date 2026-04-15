import { describe, it, expect } from 'vitest';
import { parseImports, resolveImportPath } from './importParser';

describe('parseImports', () => {
  it('parses ES module default imports', () => {
    const code = `import express from 'express';`;
    expect(parseImports(code)).toEqual(['express']);
  });

  it('parses ES module named imports', () => {
    const code = `import { Router, Request } from 'express';`;
    expect(parseImports(code)).toEqual(['express']);
  });

  it('parses ES module namespace imports', () => {
    const code = `import * as fs from 'fs';`;
    expect(parseImports(code)).toEqual(['fs']);
  });

  it('parses side-effect imports', () => {
    const code = `import './polyfill';`;
    expect(parseImports(code)).toEqual(['./polyfill']);
  });

  it('parses CommonJS require', () => {
    const code = `const express = require('express');`;
    expect(parseImports(code)).toEqual(['express']);
  });

  it('parses re-exports', () => {
    const code = `export { foo } from './bar';`;
    expect(parseImports(code)).toEqual(['./bar']);
  });

  it('parses multiple imports', () => {
    const code = `
import express from 'express';
import { Pool } from 'pg';
const fs = require('fs');
`;
    const result = parseImports(code);
    expect(result).toContain('express');
    expect(result).toContain('pg');
    expect(result).toContain('fs');
  });

  it('ignores imports inside block comments', () => {
    const code = `/* import foo from 'bar'; */`;
    expect(parseImports(code)).toEqual([]);
  });

  it('ignores imports inside single-line comments', () => {
    const code = `// import foo from 'bar';`;
    expect(parseImports(code)).toEqual([]);
  });

  it('handles empty content', () => {
    expect(parseImports('')).toEqual([]);
  });

  it('deduplicates repeated imports', () => {
    const code = `
import { a } from './utils';
import { b } from './utils';
`;
    expect(parseImports(code)).toEqual(['./utils']);
  });
});

describe('resolveImportPath', () => {
  const paths = ['/src/lib/utils.ts', '/src/lib/index.ts', '/src/app.ts'];

  it('resolves relative import with extension', () => {
    const result = resolveImportPath('./utils', paths, '/src/lib/foo.ts');
    expect(result).toBe('/src/lib/utils.ts');
  });

  it('resolves directory import to index file', () => {
    const result = resolveImportPath('./lib', paths, '/src/app.ts');
    expect(result).toBe('/src/lib/index.ts');
  });

  it('returns null for bare module specifiers', () => {
    const result = resolveImportPath('express', paths);
    expect(result).toBeNull();
  });

  it('returns null for unresolvable imports', () => {
    const result = resolveImportPath('./nonexistent', paths, '/src/app.ts');
    expect(result).toBeNull();
  });

  it('resolves parent directory references', () => {
    const result = resolveImportPath('../app', paths, '/src/lib/utils.ts');
    expect(result).toBe('/src/app.ts');
  });
});
