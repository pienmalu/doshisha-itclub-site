import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// canonical・OG・sitemap.xml がすべてこの値を基準に生成される。
const site = process.env.SITE_URL ?? 'https://doshisha-itclub.com';

export default defineConfig({
  site,
  trailingSlash: 'never',
  integrations: [sitemap({ lastmod: new Date() })],
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
