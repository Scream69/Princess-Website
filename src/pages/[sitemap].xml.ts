import type { APIRoute, GetStaticPaths } from 'astro';

/*
 * Twenty lines instead of @astrojs/sitemap: this site has three indexable
 * URLs and will not grow, so a dependency is not justified (rule 2.8).
 *
 * A sitemap needs absolute URLs, and `site` in astro.config.mjs is unset
 * until the domain is confirmed (MISSING-ASSETS.md 5) — so until then there
 * is nothing honest to emit. Hence the parameterised filename: a static build
 * writes a file for every non-dynamic endpoint whatever it returns, and the
 * first version of this shipped a `sitemap.xml` containing the words "Not
 * found", served as 200. Returning no paths emits no file at all.
 */
export const getStaticPaths: GetStaticPaths = () =>
  import.meta.env.SITE ? [{ params: { sitemap: 'sitemap' } }] : [];

const PATHS = ['/', '/order', '/privacy'];

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Not found', { status: 404 });

  const urls = PATHS.map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`);

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
