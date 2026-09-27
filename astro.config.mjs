// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { loadPublications } from './src/lib/pubs/index.mjs';

const site = 'https://saarcohen30.github.io';

// Old Jekyll URLs → new pages. Paper aliases live next to each record in publications.yaml.
const pubs = loadPublications(readFileSync('./src/data/publications.yaml', 'utf8'));
const redirects = {
  '/about': '/',
  '/about.html': '/',
  '/resume': '/cv/',
  '/publications.html': '/publications/',
  ...Object.fromEntries(pubs.flatMap((p) => p.aliases.map((a) => [a, `/publications/${p.id}/`]))),
};

export default defineConfig({
  site,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  redirects,
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [sitemap({ filter: (page) => !page.includes('/publication/') && !page.includes('/design-review/') && !/\/(about|resume)\/?$/.test(page) })],
  devToolbar: { enabled: false },
});
