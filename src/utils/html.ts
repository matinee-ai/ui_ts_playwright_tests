/**
 * Small dependency-free HTML helpers for API-level checks. Not a full parser:
 * they read start tags and their attributes, which is all the checks need.
 */

export type Attributes = Record<string, string>;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+|#39);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

export function parseAttributes(tag: string): Attributes {
  const attrs: Attributes = {};
  const body = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '');
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Attributes of every start tag with the given name, in document order. */
export function findTags(html: string, tagName: string): Attributes[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const re = new RegExp(`<${tagName}(?=[\\s/>])[^>]*>`, 'gi');
  return [...withoutComments.matchAll(re)].map((m) => parseAttributes(m[0]));
}

function absolute(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href.trim(), baseUrl).href;
  } catch {
    return undefined;
  }
}

export interface PageMeta {
  title: string;
  description?: string;
  lang?: string;
  canonical?: string;
  robots?: string;
  ogTitle?: string;
  ogImage?: string;
  alternates: Array<{ hreflang: string; href: string }>;
}

export function pageMeta(html: string, baseUrl: string): PageMeta {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const metas = findTags(html, 'meta');
  const links = findTags(html, 'link');
  const meta = (key: string) =>
    metas.find((m) => (m.name ?? m.property ?? '').toLowerCase() === key)?.content?.trim();
  const rels = (rel: string) => links.filter((l) => (l.rel ?? '').toLowerCase().split(/\s+/).includes(rel));

  return {
    title: decodeEntities(titleMatch?.[1] ?? '').replace(/\s+/g, ' ').trim(),
    description: meta('description'),
    lang: findTags(html, 'html')[0]?.lang,
    canonical: absolute(rels('canonical')[0]?.href, baseUrl),
    robots: meta('robots'),
    ogTitle: meta('og:title'),
    ogImage: absolute(meta('og:image'), baseUrl),
    alternates: rels('alternate')
      .filter((l) => l.hreflang && l.href)
      .map((l) => ({ hreflang: l.hreflang, href: absolute(l.href, baseUrl)! }))
      .filter((l) => l.href),
  };
}

/** Absolute http(s) URLs of all <a href> links. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const urls = findTags(html, 'a')
    .map((a) => absolute(a.href, baseUrl))
    .filter((u): u is string => !!u && /^https?:/i.test(u))
    .map((u) => u.split('#')[0]);
  return [...new Set(urls)];
}

/** Scripts, stylesheets, icons and images the page loads directly. */
export function extractAssets(html: string, baseUrl: string): string[] {
  const urls = [
    ...findTags(html, 'script').map((s) => s.src),
    ...findTags(html, 'link')
      .filter((l) => /\b(stylesheet|icon|preload|modulepreload)\b/i.test(l.rel ?? ''))
      .map((l) => l.href),
    ...findTags(html, 'img').map((i) => i.src),
  ]
    .map((u) => absolute(u, baseUrl))
    .filter((u): u is string => !!u && /^https?:/i.test(u));
  return [...new Set(urls)];
}

/** Visible-ish text of an HTML document: tags, scripts and styles removed. */
export function textContent(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cloudflare "email obfuscation" replaces addresses in served HTML with
 * data-cfemail="<hex>" / href="/cdn-cgi/l/email-protection#<hex>" (decoded by a script in the browser).
 * Returns the real addresses so HTTP-level checks see what visitors see.
 */
export function cloudflareEmails(html: string): string[] {
  const hexes = [...html.matchAll(/data-cfemail="([0-9a-f]+)"|email-protection#([0-9a-f]+)/gi)].map((m) => m[1] ?? m[2]);
  return [...new Set(hexes.map(decodeCloudflareEmail).filter(Boolean))];
}

export function decodeCloudflareEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}
