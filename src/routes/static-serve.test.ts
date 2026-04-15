import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { join } from 'path';
import { existsSync } from 'fs';

function createStaticApp() {
  const app = express();

  const clientDir = join(__dirname, '../../client');
  const clientDist = join(clientDir, 'dist');

  if (existsSync(join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  } else if (existsSync(join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get('*', (_req, res) => res.sendFile(join(clientDir, 'index.html')));
  }

  return app;
}

describe('Static file serving', () => {
  const app = createStaticApp();

  it('GET / returns 200 with HTML content-type', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Agent Orchestrator');
  });

  it('GET /css/base.css returns 200 with CSS content-type', async () => {
    const res = await request(app).get('/css/base.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/css/);
  });

  it('GET /css/components.css returns 200', async () => {
    const res = await request(app).get('/css/components.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/css/);
  });

  it('GET /js/utils.js returns 200 with JS content-type', async () => {
    const res = await request(app).get('/js/utils.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('GET /nonexistent returns HTML (SPA fallback)', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Agent Orchestrator');
  });

  it('HTML contains required semantic landmarks', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('<header');
    expect(res.text).toContain('<nav');
    expect(res.text).toContain('<main');
    expect(res.text).toContain('<footer');
    expect(res.text).toContain('id="root"');
  });
});
