/**
 * Offline check of the link auditor against a fixture page that contains one
 * example of every problem it reports. Served by a real HTTP server so the
 * "live URL" check makes real requests.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../../src/fixtures.ts';
import { auditLinks, describeLinks } from '../../src/helpers/link-audit.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
let server: Server;
let origin: string;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const body = await readFile(FIXTURES + (req.url ?? '/').split('?')[0].replace(/^\/+/, ''));
      res.writeHead(200, { 'content-type': req.url?.endsWith('.js') ? 'text/javascript' : 'text/html' }).end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('link audit reports each kind of link problem and nothing else', async ({ page, request }) => {
  await page.goto(`${origin}/links.html`);
  const audit = await auditLinks(page, request);

  expect(audit.links.some((l) => l.href === '/hidden-missing.html'), 'hidden links are not audited').toBe(false);
  expect(describeLinks(audit.unnamed)).toEqual(['<no name> (/forms.html) [main]']);
  expect(audit.dead.map((l) => l.name)).toEqual(['Dead hash link', 'Dead JS link']);
  expect(audit.notClickable.map((l) => l.name)).toEqual(['Covered link']);
  expect(audit.notClickable[0].reason).toMatch(/intercepts pointer events/);
  expect(audit.broken.map((b) => [new URL(b.url).pathname, b.status])).toEqual([['/missing-page.html', 404]]);
  expect(audit.unsafeBlank.map((l) => l.name)).toEqual(['External without rel']);
  expect(audit.malformedContact.map((l) => l.name)).toEqual(['Bad mailto', 'Bad tel']);
  expect(audit.missingAnchors.map((l) => l.href)).toEqual(['#no-such-section']);
  expect(audit.links.find((l) => l.name === 'Puzzle board')?.kind, 'icon link named by aria-label').toBe('internal');
});
