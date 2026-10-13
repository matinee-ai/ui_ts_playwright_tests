import type { APIRequestContext } from '@playwright/test';

export interface UrlCheck {
  url: string;
  status: number;
  error?: string;
}

/** Status of a URL, trying HEAD first and falling back to GET for servers that reject HEAD. */
export async function statusOf(request: APIRequestContext, url: string): Promise<UrlCheck> {
  try {
    const head = await request.head(url, { timeout: 20_000, maxRedirects: 5 });
    if (![403, 405, 501].includes(head.status())) return { url, status: head.status() };
  } catch {
    // fall through to GET
  }
  try {
    const get = await request.get(url, { timeout: 30_000, maxRedirects: 5 });
    return { url, status: get.status() };
  } catch (e) {
    return { url, status: 0, error: (e as Error).message.split('\n')[0] };
  }
}

/** Checks URLs with limited concurrency; returns the ones that failed (status 0 or >= 400). */
export async function brokenUrls(
  request: APIRequestContext,
  urls: string[],
  { concurrency = 6 } = {},
): Promise<UrlCheck[]> {
  const queue = [...new Set(urls)];
  const failures: UrlCheck[] = [];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const result = await statusOf(request, url);
      if (result.status === 0 || result.status >= 400) failures.push(result);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failures;
}

/** Up to `count` items spread evenly across the list (deterministic, so failures reproduce). */
export function sample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

export function sameSite(url: string, origin: string): boolean {
  const strip = (host: string) => host.replace(/^www\./, '');
  try {
    return strip(new URL(url).hostname) === strip(new URL(origin).hostname);
  } catch {
    return false;
  }
}
