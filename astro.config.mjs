import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static output only: there is no server runtime in this project, and the
// enquiry is submitted client-side to a third-party form endpoint.
export default defineConfig({
  output: 'static',
  // site: set to the live domain before launch — required for sitemap.xml
  // and absolute Open Graph URLs (see CLAUDE.md 10.4).
  // site: 'https://example.com',
  vite: {
    plugins: [tailwindcss()],
  },
});
