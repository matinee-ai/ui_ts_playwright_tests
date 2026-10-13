import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PROJECTS, HOUR_SLOTS, cronForHour, dueProjects, hourFromCron, planForDate, toUtcDate } from '../../scripts/schedule.ts';

const DAY = 86_400_000;
const days = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => toUtcDate(new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY)));
const runAt = (date: string, hour: number, minute: number) => Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000 + minute * 60_000;

test.describe('daily schedule', () => {
  const calendar = days('2026-01-01', 3 * 365);

  test('every project runs exactly once a day, each at its own time', () => {
    for (const date of calendar) {
      const plan = planForDate(date);
      expect(plan.map((r) => r.project).sort(), date).toEqual([...PROJECTS].sort());
      expect(new Set(plan.map((r) => r.hour)).size, `${date}: distinct hours`).toBe(PROJECTS.length);
    }
  });

  test("a project's run time changes every day", () => {
    for (let i = 1; i < calendar.length; i++) {
      const yesterday = planForDate(calendar[i - 1]);
      for (const run of planForDate(calendar[i])) {
        const previous = yesterday.find((r) => r.project === run.project)!;
        expect(run.time, `${run.project} on ${run.date} vs ${previous.date}`).not.toBe(previous.time);
      }
    }
  });

  test('two runs of the same project are at least 8 hours apart', () => {
    for (const project of PROJECTS) {
      const runs = calendar.map((date) => planForDate(date).find((r) => r.project === project)!);
      for (let i = 1; i < runs.length; i++) {
        const gapHours = (runAt(runs[i].date, runs[i].hour, runs[i].minute) - runAt(runs[i - 1].date, runs[i - 1].hour, runs[i - 1].minute)) / 3_600_000;
        expect(gapHours, `${project} ${runs[i - 1].date} ${runs[i - 1].time} -> ${runs[i].date} ${runs[i].time}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  test('times vary across the whole day, not just a fixed set', () => {
    for (const project of PROJECTS) {
      const hours = new Set(calendar.slice(0, 120).map((date) => planForDate(date).find((r) => r.project === project)!.hour));
      expect(hours.size, `${project} distinct hours over 120 days`).toBeGreaterThanOrEqual(18);
    }
  });

  test('workflow has exactly one cron line per hour slot', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/daily-e2e.yml', import.meta.url), 'utf8');
    const crons = [...workflow.matchAll(/-\s*cron:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(crons).toEqual(HOUR_SLOTS.map(({ hour }) => cronForHour(hour)));
  });

  test('each hour slot triggers exactly the projects planned for it', () => {
    const date = '2026-10-13';
    const plan = planForDate(date);
    for (const { hour } of HOUR_SLOTS) {
      const now = new Date(`${date}T${String(hour).padStart(2, '0')}:40:00Z`);
      expect(dueProjects(now, hourFromCron(cronForHour(hour)))).toEqual(plan.filter((r) => r.hour === hour).map((r) => r.project));
    }
  });

  test('a late 23:xx run that starts after midnight uses the previous day', () => {
    const lateRun = new Date('2026-10-14T00:20:00Z');
    const yesterday = planForDate('2026-10-13').filter((r) => r.hour === 23).map((r) => r.project);
    expect(dueProjects(lateRun, 23)).toEqual(yesterday);
  });

  test('rejects unexpected cron expressions', () => {
    expect(() => hourFromCron('*/5 * * * *')).toThrow();
    expect(() => hourFromCron('7 24 * * *')).toThrow();
    expect(hourFromCron('53 2 * * *')).toBe(2);
  });
});
