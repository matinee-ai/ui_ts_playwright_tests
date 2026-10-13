/**
 * CLI around the planner.
 *
 *   node scripts/schedule-cli.ts show [days]      table of upcoming run times (UTC)
 *   node scripts/schedule-cli.ts cron             cron lines for the workflow file
 *   node scripts/schedule-cli.ts due "<cron>"     JSON array of projects due for that cron slot
 *   node scripts/schedule-cli.ts pick "<a,b|all>" JSON array of validated project names (manual runs)
 */
import { cronForHour, dueProjects, HOUR_SLOTS, hourFromCron, planForDate, PROJECTS, toUtcDate, type Project } from './schedule.ts';

const [command = 'show', arg] = process.argv.slice(2);

switch (command) {
  case 'show': {
    const days = Number(arg ?? 14);
    const start = Date.now();
    const rows: string[] = ['| Date (UTC) | Project | Time (UTC) |', '| --- | --- | --- |'];
    for (let i = 0; i < days; i++) {
      const date = toUtcDate(new Date(start + i * 86_400_000));
      for (const run of planForDate(date)) rows.push(`| ${date} | ${run.project} | ${run.time} |`);
    }
    console.log(rows.join('\n'));
    break;
  }
  case 'cron': {
    for (const { hour } of HOUR_SLOTS) console.log(`    - cron: '${cronForHour(hour)}'`);
    break;
  }
  case 'due': {
    if (!arg) throw new Error('Usage: schedule-cli.ts due "<cron expression>"');
    console.log(JSON.stringify(dueProjects(new Date(), hourFromCron(arg))));
    break;
  }
  case 'pick': {
    const wanted = !arg || arg.trim() === 'all' ? [...PROJECTS] : arg.split(',').map((p) => p.trim()).filter(Boolean);
    const unknown = wanted.filter((p) => !PROJECTS.includes(p as Project));
    if (unknown.length) throw new Error(`Unknown project(s): ${unknown.join(', ')}. Known: ${PROJECTS.join(', ')}`);
    console.log(JSON.stringify([...new Set(wanted)]));
    break;
  }
  default:
    throw new Error(`Unknown command "${command}". Use show | cron | due | pick.`);
}
