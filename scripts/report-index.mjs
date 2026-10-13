// Writes reports.json at the root of the gh-pages site: every slot's runs with their
// Allure summaries, newest first. report-site/index.html renders it as a dashboard.
//   node scripts/report-index.mjs <site-dir>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = process.argv[2];
if (!site) throw new Error('usage: report-index.mjs <site-dir>');

const readSummary = (dir) => {
  try {
    const { stats, status, createdAt, duration } = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    return { stats, status, createdAt, duration };
  } catch {
    return null;
  }
};

const slots = {};
for (const slot of readdirSync(site, { withFileTypes: true })) {
  const runsDir = join(site, slot.name, 'runs');
  if (!slot.isDirectory() || !existsSync(runsDir)) continue;
  const runs = readdirSync(runsDir)
    .map((id) => ({ id, path: `${slot.name}/runs/${id}/`, ...readSummary(join(runsDir, id)) }))
    .filter((run) => run.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt);
  slots[slot.name] = { latest: `${slot.name}/latest/`, runs };
}

writeFileSync(join(site, 'reports.json'), JSON.stringify({ generatedAt: Date.now(), slots }, null, 2));
console.log(`reports.json: ${Object.entries(slots).map(([k, v]) => `${k} (${v.runs.length})`).join(', ')}`);
