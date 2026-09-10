import type { APIRoute } from 'astro';

/*
 * Generated rather than static, because the Sitemap line needs the live
 * domain and `site` in astro.config.mjs is still unset (MISSING-ASSETS.md 5).
 * Emitting `Sitemap:` against a guessed host would point crawlers at nothing.
 *
 * Both pages are indexable: /order is a real landing page for brand searches,
 * even though / is the ranking target (CLAUDE.md 10.4).
 */
export const GET: APIRoute = ({ site }) => {
  const lines = ['User-agent: *', 'Allow: /'];
  if (site) lines.push('', `Sitemap: ${new URL('sitemap.xml', site).href}`);

  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
