import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 本番ドメインが決まったら SITE_URL を設定する（Vercel / Netlify なら環境変数で渡せる）。
// canonical・OG・sitemap.xml がすべてこの値を基準に生成される。
const site = process.env.SITE_URL ?? 'https://example.com';

export default defineConfig({
  site,
  trailingSlash: 'never',
  integrations: [sitemap({ lastmod: new Date() })],
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
