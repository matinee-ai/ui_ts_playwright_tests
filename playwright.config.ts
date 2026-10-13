import { defineConfig, devices, type Project } from '@playwright/test';
import { SITE_LIST } from './config/sites.ts';

const CI = !!process.env.CI;

const siteProjects: Project[] = SITE_LIST.flatMap((site) => [
  {
    name: `${site.key}-api`,
    testDir: `./tests/${site.key}/api`,
    // Tags our own HTTP calls so they can be filtered out of server logs/analytics.
    // (Not set for browser projects: a custom header makes cross-origin XHRs fail CORS preflight.)
    use: { baseURL: site.baseURL, extraHTTPHeaders: { 'X-Automated-Test': 'playwright-daily' } },
  },
  {
    name: `${site.key}-ui`,
    testDir: `./tests/${site.key}/ui`,
    use: { ...devices['Desktop Chrome'], baseURL: site.baseURL },
  },
]);

export default defineConfig({
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: CI,
  // Live production sites: one retry absorbs a dropped connection, a second failure is reported.
  retries: CI ? 1 : 0,
  workers: CI ? 4 : undefined,
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Service workers can answer requests before page.route() sees them; the form spy relies on routing.
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    // Offline checks of the framework itself (scheduler, parsers, board/form helpers).
    { name: 'unit', testDir: './tests/unit' },
    { name: 'framework', testDir: './tests/framework', use: { ...devices['Desktop Chrome'] } },
    ...siteProjects,
  ],
});
