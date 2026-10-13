/**
 * Daily run planner.
 *
 * Every project runs once per day, at a time that
 *   - is different for each project on the same day, and
 *   - is different from the time the same project ran the day before.
 *
 * How: the UTC day is split into three 8-hour windows (00-07, 08-15, 16-23).
 * Each project gets its own window, and the windows rotate one step back every
 * day (16-23 -> 08-15 -> 00-07 -> 16-23 ...), so two projects never share a
 * window and a project never keeps yesterday's window. Rotating backwards also
 * keeps at least 8 hours between two runs of the same project. Inside its window
 * the exact hour comes from a hash of (date, project), so the time also moves
 * around within the window from day to day.
 *
 * The GitHub workflow fires once per hour (one cron line per hour, see
 * HOUR_SLOTS), and asks this planner which projects are due in that hour.
 *
 * This file must stay dependency-free: CI runs it directly with
 * `node scripts/schedule-cli.ts` (native TypeScript type stripping) before `npm ci`.
 */

export const PROJECTS = ['chessorro', 'qastarting', 'spas'] as const;
export type Project = (typeof PROJECTS)[number];

const WINDOW_HOURS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The minute each hourly cron line fires at. Spread over the hour (and never :00,
 * when GitHub's scheduler is busiest) so run times differ in minutes too.
 */
export const HOUR_SLOTS: ReadonlyArray<{ hour: number; minute: number }> = Array.from(
  { length: 24 },
  (_, hour) => ({ hour, minute: (7 + hour * 23) % 60 }),
);

export interface PlannedRun {
  project: Project;
  /** UTC date, YYYY-MM-DD. */
  date: string;
  hour: number;
  minute: number;
  /** HH:MM UTC. */
  time: string;
}

/** FNV-1a, 32 bit. Stable across Node versions and platforms. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function toUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

/** Optional salt so a fork can get its own sequence of times. */
function seed(): string {
  return process.env.SCHEDULE_SEED ?? '';
}

export function planForDate(isoDate: string): PlannedRun[] {
  const day = dayNumber(isoDate);
  return PROJECTS.map((project, index) => {
    const window = (((index - day) % PROJECTS.length) + PROJECTS.length) % PROJECTS.length;
    const offset = hash(`${seed()}|${isoDate}|${project}`) % WINDOW_HOURS;
    const hour = window * WINDOW_HOURS + offset;
    const { minute } = HOUR_SLOTS[hour];
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return { project, date: isoDate, hour, minute, time };
  }).sort((a, b) => a.hour - b.hour);
}

/** Cron line for an hour slot, exactly as written in the workflow file. */
export function cronForHour(hour: number): string {
  return `${HOUR_SLOTS[hour].minute} ${hour} * * *`;
}

/** Parses the hour back out of `github.event.schedule` (e.g. "53 2 * * *" -> 2). */
export function hourFromCron(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  const hour = Number(parts[1]);
  if (parts.length !== 5 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Unexpected cron expression: "${cron}"`);
  }
  return hour;
}

/**
 * GitHub can start a scheduled run late. A run for the 23:xx slot that only
 * starts after midnight still belongs to the previous day's plan.
 */
export function slotDate(now: Date, slotHour: number): string {
  const date = slotHour > now.getUTCHours() ? new Date(now.getTime() - DAY_MS) : now;
  return toUtcDate(date);
}

/** Projects due in the given hour slot. */
export function dueProjects(now: Date, slotHour: number): Project[] {
  return planForDate(slotDate(now, slotHour))
    .filter((run) => run.hour === slotHour)
    .map((run) => run.project);
}
