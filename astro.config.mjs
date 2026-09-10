import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static output only: there is no server runtime in this project, and the
// enquiry is submitted client-side to a third-party form endpoint.
export default defineConfig({
  output: 'static',

  /*
   * Emit `order.html` rather than `order/index.html`.
   *
   * The default nests every page in its own directory, and a static host then
   * serves it at `/order/` and 308s `/order` to reach it. Every internal link
   * on this site points at `/order`, so every entry into the wizard was
   * paying an extra round trip — and the canonical URL Astro generates
   * (`/order`) would not have matched the URL actually served (`/order/`),
   * which is exactly the sort of thing that quietly splits a page's ranking.
   *
   * Verified against the live Cloudflare Pages deploy, which was doing this.
   */
  build: { format: 'file' },
  trailingSlash: 'never',
  // site: set to the live domain before launch — required for sitemap.xml
  // and absolute Open Graph URLs (see CLAUDE.md 10.4).
  // site: 'https://example.com',
  vite: {
    plugins: [tailwindcss()],
  },
});
