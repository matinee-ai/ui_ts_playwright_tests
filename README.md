# UI + API regression tests: Chessorro, QA Starting, Spas Life

Playwright + TypeScript suites for three production sites, run automatically once a day per site, each at its own time, and at a different time every day.

| Project | Site | Functional coverage |
| --- | --- | --- |
| `chessorro` | https://www.chessorro.com/en | Offline board: start position, legal moves for both sides, captures, illegal and out-of-turn moves rejected. Puzzles: valid position (one king each, no pawns on the back ranks), "next puzzle", difficulty filter. Openings: autoplay moves the pieces. Feature pages are live. |
| `qastarting` | https://www.qastarting.org | Course catalogue lists all 5 tracks. A course card opens its enrolment form. Enrolment form: empty form and bad email are rejected, a complete form is sent with the entered data. Pricing: Starter < Standard < Ultimate for every course, and the 3-course bundle total matches the Ultimate prices and is discounted. FAQ expands and collapses. |
| `spas` | https://www.spas.life | "Need help?" request form: empty form rejected, complete request sent. Icon gallery opens an icon page whose title and image match the card. A known icon page stays published. Phone, email and Telegram contacts are present and clickable. |

Every site also gets the shared checks:

- **API (`*-api` projects, no browser):** 200 + HTML within a time budget; HTTP redirects to HTTPS; title, description, `lang`, canonical; not `noindex`; `robots.txt` doesn't block the site; every sitemap URL is live; unknown URLs return a real 404; scripts, CSS and images load; each `hreflang` version is live and declares its language; contact details are correct.
- **UI (`*-ui` projects, Chromium):** no uncaught JS errors or failed same-site requests while scrolling the landing page; header, menu and footer links are live; the language switcher changes `<html lang>`; contact links work; on mobile (Pixel 7) there's no horizontal scroll and the menu opens.

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

In the daily workflow each project gets its own report, uploaded as the `allure-report-<project>-<run id>` artifact (kept 30 days), with a pass/fail line in the run summary. Each project's history is kept in the Actions cache, so trends build up run after run. The Playwright HTML report and traces are still uploaded separately as `playwright-report-<project>-<run id>`.

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

Hours with nothing due finish in a few seconds. Each run uploads an Allure report (see above) and the Playwright report as artifacts. Use **Actions → Daily E2E → Run workflow** to run any project or suite (`all` / `api` / `ui`) on demand.

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
config/sites.ts            base URLs, landing paths, expected contact details
scripts/schedule.ts        daily planner (no dependencies; CI runs it with plain `node`)
src/fixtures.ts            test fixture: analytics blocking, pageErrors, formSpy, Allure labels
src/helpers/chess-board.ts reads/plays any DOM chess board (chessground, react-chessboard, chessboard.js, 8x8 grids)
src/helpers/forms.ts       finds, fills, submits and validates forms by field meaning (email/phone/name/...)
src/helpers/site-page.ts   shared page object: open, consent banners, menu navigation, contact links
src/pages/*.ts             one page object per site
src/suites/common-*.ts     shared API and UI checks registered for each site
tests/<site>/{api,ui}/     site specs
tests/unit, tests/framework  self-tests
```

## First live run: what to check

These suites were written without access to the three sites: the build environment's network policy blocked them. Selectors therefore lean on roles, visible text and DOM conventions rather than exact markup, and the helpers are proven against local fixtures. Some details came from the sites' public search snippets: the feature names, course names, prices, contact details and the icon page URL. The first real run may show places where the markup differs. Each failure message names what was expected, and the place to adjust is the matching page object in `src/pages/`. Points to look at first:

- **Chessorro:** the domain. The public site found in search is `chessoro.com` (one "r"). The suite uses `chessorro.com` as given; set `CHESSORRO_URL` if that's wrong. Also check the link names and paths in `CORE_FEATURES`.
- **QA Starting:** search engines only know `qastarting.com`. The `/courses` and `/en/qabasic` paths in `tests/qastarting/api/courses.api.spec.ts` come from there.
- **Spas Life:** `ICONS_PATH` / `KNOWN_ICON` and the help-section wording in `src/pages/spas.ts`.
