// Allure 3 report settings (https://allurereport.org/docs/v3/configure/).
// Tests write raw results to ./allure-results (see playwright.config.ts);
// `npm run allure` turns them into ./allure-report/index.html.
//
// Environment switches (used by CI, which builds two variants of the same run):
//   ALLURE_OUTPUT=dir           where to write the report (default ./allure-report)
//   ALLURE_SINGLE_FILE=0        many small files instead of one HTML (for GitHub Pages)
//   ALLURE_APPEND_HISTORY=0     read history for trends but don't record this run again
import { defineConfig } from 'allure';
import { SITE_LIST } from './config/sites.ts';

const env = process.env;
const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';

// Failure buckets, first match wins. Separates "site is down" from "site changed" from "feature broken".
const categories = [
  {
    name: 'Site unreachable',
    matchers: { message: /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|net::ERR_|getaddrinfo/i },
    groupBy: [{ label: 'epic' }],
  },
  {
    name: 'Slow responses',
    matchers: { message: /landing page took \d+ms/ },
    groupBy: [{ label: 'epic' }],
  },
  {
    name: 'Page changed: element or page not found',
    matchers: [
      { message: /No chess board found|No visible form|No link matching|No form or call-to-action|Update the page object/ },
      { message: /waiting for (locator|getBy)|locator\.\w+: Timeout/i },
    ],
    groupBy: [{ label: 'epic' }],
  },
  {
    name: 'Broken links or failed requests',
    matchers: { message: /"status": (0|[45]\d\d)|failed same-site requests/ },
    groupBy: [{ label: 'epic' }],
  },
  { name: 'Functional checks failed', matchers: { statuses: ['failed'] }, groupBy: [{ label: 'epic' }, { label: 'feature' }] },
  { name: 'Test errors', matchers: { statuses: ['broken'] }, groupBy: [{ label: 'epic' }] },
];

export default defineConfig({
  name: env.ALLURE_REPORT_NAME || 'Daily E2E: Chessorro, QA Starting, Spas Life',
  output: env.ALLURE_OUTPUT || './allure-report',
  resultsDir: './allure-results',
  // Trend charts and "new failure / fixed" markers across runs. CI keeps this file in the Actions cache.
  historyPath: './allure-history/history.jsonl',
  historyLimit: 60,
  appendHistory: env.ALLURE_APPEND_HISTORY !== '0',
  categories,
  variables: Object.fromEntries(
    Object.entries({
      ...Object.fromEntries(SITE_LIST.map((site) => [site.name, `${site.baseURL}${site.homePath}`])),
      Trigger: env.GITHUB_EVENT_NAME === 'schedule' ? `schedule (${env.SCHEDULE_SLOT ?? 'hourly slot'})` : env.GITHUB_EVENT_NAME,
      Branch: env.GITHUB_REF_NAME,
      Commit: env.GITHUB_SHA?.slice(0, 7),
      'CI run': runUrl,
    }).filter(([, value]) => value),
  ),
  plugins: {
    awesome: {
      options: {
        // One self-contained HTML file opens straight from a downloaded artifact, no server needed.
        // GitHub Pages gets the multi-file variant: no single huge file when many tests attach videos.
        singleFile: env.ALLURE_SINGLE_FILE !== '0',
        reportLanguage: 'en',
        groupBy: ['epic', 'feature', 'story'],
      },
    },
  },
});
