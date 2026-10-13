/**
 * Runs the real negative sign-in suite against a fixture login page backed by
 * a local server that rejects every login, to prove the suite and LoginForm
 * work before they meet a live site.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { SITES, type SiteConfig } from '../../config/sites.ts';
import { test } from '../../src/fixtures.ts';
import { loginNegativeTests } from '../../src/suites/login-negative.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const site: SiteConfig = { ...SITES.chessorro, name: 'Fixture', baseURL: '' };
let server: Server;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/auth/login') {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Invalid email or password' }));
      return;
    }
    try {
      res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(FIXTURES + (req.url ?? '/').replace(/^\/+/, '').split('?')[0]));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  site.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

loginNegativeTests(site, {
  open: async (page) => {
    await page.goto(`${site.baseURL}/login.html`);
  },
  stayOn: /\/login\.html/,
});
