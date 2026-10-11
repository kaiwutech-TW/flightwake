import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const site = process.env.SITE_URL || 'https://flightwake.kaiwu.com.tw';

export default defineConfig({
  site,
  output: 'static',
  integrations: [sitemap({ i18n: { defaultLocale: 'zh-TW', locales: { 'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', en: 'en', ja: 'ja' } } })],
});
