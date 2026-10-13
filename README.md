# UI + API regression tests: Chessorro, QA Starting, Spas Life

Playwright + TypeScript suites for three production sites, run automatically once a day per site, each at its own time, and at a different time every day.

| Project | Site | What is covered |
| --- | --- | --- |
| `chessorro` | https://www.chessorro.com/en | Four game cards open their games; game setup (every option group, defaults, selection, keyboard); a chess game vs the computer starts from the initial position, refuses an illegal move and answers a legal one; dark theme persists; language menu; sign-in negative suite; sign-up and password-reset validation (no account is ever created); "Continue with Google" hand-off; leaderboard requires sign-in (UI and HTTP redirect). |
| `qastarting` | https://www.qastarting.org | Pricing rules (Starter < Standard < Unlimited, table matches cards, bundle = three Unlimited plans minus the advertised saving); course pages and their programs; checkout (order total, add/remove, `?course=` and `?bundle=` preselection, payment method, required details, intercepted order); free-lessons and callback forms; career quiz; story filters; RU/EN switch; sign-in modal negative suite. |
| `spas` | https://www.spas.life | Russian and English menus; request and contact forms (validation, consent required, anti-spam field left empty, intercepted submission); church calendar (shows today, old style is 13 days behind, style switch, month view, readings expand); every page exists in both languages; icon pages; contact links. |

Every site also gets the shared suites (`src/suites/`):

- **Navigation:** each header and footer menu item opens the right page (URL, heading, title, no script errors); every page opens directly by URL; back and forward restore pages in order; the logo leads home; unknown URLs show a 404 page with a way back; one `h1` per page.
- **Links:** on each main page every visible link has an accessible name, isn't a dead `#`/`javascript:` link, can really be clicked (not covered by another element), leads to a live page, has a valid `mailto:`/`tel:` address, and in-page `#anchors` exist; new-tab links use `rel="noopener"`.
- **Sign-in, negative** (sites with accounts): empty fields, malformed emails, missing password, unknown account, an error that doesn't reveal whether the account exists, SQL-injection and script payloads (no script runs, nothing rendered as HTML, no server errors), password masked and never in a URL, very long input. After each: an error is shown, the user stays on the form, and no session exists.
- **HTTP contract:** 200 + HTML within a time budget; HTTP redirects to HTTPS; SEO metadata; not `noindex`; `robots.txt`; every sitemap URL is live; real 404s; assets load; language versions; contact details.
- **Page health:** no uncaught JS errors or failed same-site requests while scrolling; mobile layout without horizontal scroll and a working menu.

The page objects (`src/pages/`) were written from a crawl of the live sites (`scripts/discover-sites.ts`, run by the *Site discovery* workflow, results on the `site-discovery` branch): real routes, headings, accessible names, forms and fields.

## Allure report

Every run writes Allure results (`allure-results/`), and `allurerc.mjs` turns them into an [Allure 3](https://allurereport.org) report: **one self-contained `allure-report/index.html`** that opens straight from disk (no server, no Java).

```bash
npm run test:spas            # any test run writes allure-results/
npm run allure               # build allure-report/index.html
npm run allure:open          # or serve it in the browser
npm run allure:clean         # start fresh (results accumulate across local runs)
```

What's in it:

- **Grouped by site → API/UI → feature** (epic / feature / story labels set automatically by the `allureMetadata` fixture in `src/fixtures.ts`), with a link to the site on every test.
- **Severity** from tags: `@blocker` (landing page down), `@critical` (forms, chess board, pricing, contacts, HTTPS, script errors), `@minor` (SEO, sitemap, 404, language), the rest `normal`. Tag a test or describe block with `{ tag: '@critical' }` to change it.
- **Readable steps**: "Open /en", "Open section /puzzle/i", "Move e2 → e4", "Fill the form", "Submit the form", plus every Playwright action under them. Screenshots, videos and traces of failures are attached, and form tests attach the intercepted submission.
- **Failure categories** that separate *Site unreachable* (DNS/connection errors), *Slow responses*, *Page changed* (element not found, update the page object), *Broken links or failed requests*, *Functional checks failed* and *Test errors*, each grouped by site.
- **Report header** with the URLs under test, the trigger, commit and a link to the CI run.
- **History and trends**: `allure-history/history.jsonl` marks new, fixed and flaky tests and feeds the trend charts.

### Report links

Reports are hosted on GitHub Pages: **https://matinee-ai.github.io/ui_ts_playwright_tests/**

That page is a dashboard with each project's latest status and its recent runs. Every workflow run also posts its own report link:

- in the run's **Annotations** box ("Allure report: chessorro" → link), and
- in the run **Summary**, with the latest report for that project and the dashboard.

| Path | Contents |
| --- | --- |
| `/<project>/latest/` | latest report for `chessorro`, `qastarting`, `spas`, or `self-test` (CI on every push) |
| `/<project>/runs/<run id>-<attempt>/` | report of one run (newest 15 kept per project) |

**One-time setup:** Settings → Pages → Build and deployment → Source: *Deploy from a branch* → `gh-pages` / `(root)` → Save. The workflows create and update the `gh-pages` branch themselves. Until Pages is on, runs show a warning next to the link. Each run's history (trends, new and fixed tests) is stored on `gh-pages` next to its report.

The `gh-pages` branch always holds a single commit (force-pushed with a lease and retried if two runs publish at once), so old reports don't pile up in git history. `scripts/allure-pages.sh` does the publishing. To serve the reports from another domain, set the repository variable `REPORT_BASE_URL`.

Each daily run also uploads a single-file copy as the `allure-report-<project>-<run id>` artifact (30 days), plus the Playwright report and traces as `playwright-report-<project>-<run id>`.

## Forms never reach production

Form tests use the `formSpy` fixture (`src/fixtures.ts`). Once armed, it answers every outgoing submission inside the browser with a fake `200` and records it, so the test can check what *would* have been sent. No lead, enrolment or help request is ever created. Analytics and trackers are also blocked during UI runs, so the daily visits don't skew the sites' statistics (`BLOCK_ANALYTICS=0` turns this off).

## Daily schedule

`.github/workflows/daily-e2e.yml` wakes up once an hour. `scripts/schedule.ts` then decides which project, if any, is due that hour:

- The UTC day is split into three 8-hour windows (00–07, 08–15, 16–23). Each project gets its own window, so **the three projects never run at the same time**.
- The windows rotate every day, and the hour inside a window comes from a hash of the date. So **a project never runs at the same time two days in a row**, and over a few weeks its runs cover the whole day. Two runs of the same project are always at least 8 hours apart.
- It's deterministic and needs no stored state. Set the repository variable `SCHEDULE_SEED` to get a different sequence.

```bash
npm run schedule        # upcoming run times for the next 14 days (UTC)
```

Hours with nothing due finish in a few seconds. Each run publishes its Allure report and posts the link (see [Report links](#report-links)). Use **Actions → Daily E2E → Run workflow** to run any project or suite (`all` / `api` / `ui`) on demand.

> GitHub only runs scheduled workflows from the repository's **default branch**, so the schedule starts once this is on the default branch.

## Run locally

```bash
npm ci
npx playwright install chromium

npm test                     # everything
npm run test:chessorro       # one site (api + ui)
npm run test:api             # API suites of all sites
npx playwright test --project=spas-ui --headed
npm run report               # open the last HTML report
```

Point a run at another environment: `CHESSORRO_URL`, `QASTARTING_URL`, `SPAS_URL` (also read from repository variables in CI).

## Self-tests (no internet needed)

```bash
npm run typecheck
npm run test:self            # scheduler + parsers (unit) and the board/form helpers on local fixture pages (framework)
```

`.github/workflows/ci.yml` runs these on every push. The `framework` project drives the real chessground board library and fixture forms (native validation, Tilda-style JS validation, a modal opened by a button). A broken helper shows up there instead of as a confusing failure on a live site.

## Layout

```
allurerc.mjs               Allure report settings: categories, history, report header
report-site/index.html     dashboard at the root of the GitHub Pages site
scripts/allure-pages.sh    publishes a report to gh-pages and posts its link
config/sites.ts            base URLs, landing paths, expected contact details
scripts/schedule.ts        daily planner (no dependencies; CI runs it with plain `node`)
src/fixtures.ts            test fixture: analytics blocking, pageErrors, formSpy, Allure labels
src/helpers/chess-board.ts reads/plays any DOM chess board (chessground, react-chessboard, chessboard.js, 8x8 grids)
src/helpers/forms.ts       finds, fills, submits and validates forms by field meaning (email/phone/name/...)
src/helpers/site-page.ts   shared page object: open, consent banners, menu navigation, contact links
src/helpers/link-audit.ts  audits every visible link on a page (name, target, clickability, status)
src/helpers/login-form.ts  drives any sign-in form; tracks auth requests, errors and session state
src/pages/*.ts             one page object per site
src/suites/*.ts            shared suites: common API/UI, navigation, links, negative sign-in
tests/<site>/{api,ui}/     site specs
tests/unit, tests/framework  self-tests
```

## Keeping the suites in step with the sites

Run the **Site discovery** workflow (Actions → Site discovery → Run workflow) after a redesign. It crawls each site and stores pages, menus, forms, API calls, accessibility snapshots and screenshots on the `site-discovery` branch. Compare it with `PAGES` in `src/pages/<site>.ts`. Failures in the report are grouped into categories: *Page changed* means a locator no longer matches, and the place to fix it is that site's page object.
