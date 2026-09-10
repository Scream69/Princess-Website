import type { APIRoute } from 'astro';

/*
 * Generated rather than static, because what it should say depends on whether
 * the site has launched — and `site` in astro.config.mjs is the one honest
 * signal for that (MISSING-ASSETS.md 5).
 *
 * Unset means the only address this build has is a temporary one: a
 * *.pages.dev or *.netlify.app URL. Those are public and indexable, so a
 * pre-launch deploy carrying real copy gets crawled, and the real domain then
 * launches competing with a copy of itself that search engines found first.
 * Disallowing until the domain is set costs nothing and removes that risk.
 *
 * Once `site` is set, both pages are indexable: /order is a real landing page
 * for brand searches, even though / is the ranking target (CLAUDE.md 10.4).
 */
export const GET: APIRoute = ({ site }) => {
  const lines = site
    ? ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('sitemap.xml', site).href}`]
    : [
        '# No live domain is configured yet, so this build is on a temporary',
        '# host. Set `site` in astro.config.mjs at launch and this becomes',
        '# an Allow.',
        'User-agent: *',
        'Disallow: /',
      ];

  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
