// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.edwardjensen.net',

  // Static site generation — all pages are pre-rendered at build time.
  // The Cloudflare adapter is installed for future SSR capability; individual
  // pages can opt into on-demand rendering with `export const prerender = false`.
  output: 'static',

  adapter: cloudflare(),

  integrations: [preact()],

  vite: {
    plugins: [tailwindcss()],
  },
});