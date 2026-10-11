# flightwake showcase site

A four-language, static Astro site for flightwake. The core npm package is built from the repository root; this site is isolated in `website/` and is not included in the npm package.

## Local development

Requires Node.js 22 or newer for the site. The flightwake CLI itself supports Node.js 18 or newer.

```sh
cd website
npm ci
npm run dev
npm run check
npm run build
```

The routes are `/` (繁體中文), `/zh-CN/` (简体中文), `/en/` (English), and `/ja/` (日本語). Update the content in `src/content.ts`; keep all four versions in sync. The shared layout generates canonical URLs, Open Graph metadata, SoftwareApplication and FAQ structured data. Astro generates a multilingual sitemap. `robots.txt` and `llms.txt` are static endpoints using the configured site URL.

## Cloudflare Pages

Connect the `kaiwutech-TW/flightwake` repository to a Cloudflare Pages project. Set:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `website` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `SITE_URL=https://flightwake.kaiwu.com.tw` |
| Node.js version | `22` (`NODE_VERSION=22` if the Pages build environment does not read `.node-version`) |

`SITE_URL` defaults to `https://flightwake.kaiwu.com.tw`; set the same value in Pages for explicitness. It feeds canonical URLs, `hreflang`, the sitemap, `robots.txt`, `llms.txt`, and the Open Graph image URL. Rebuild if the domain changes.

This is a fully static build and needs no Cloudflare adapter or server-side runtime. Configure the project to deploy from Git; Pages will build again after pushes to `main`. The site does not publish the flightwake npm package.

## Release copy

The site currently distinguishes the published npm 0.15.0 release from work intended for 0.16.0 that is committed on `main` but unreleased. Some Fleet real-session cases remain unverified. Update `src/content.ts`, `src/layouts/Base.astro`, and `src/pages/llms.txt.ts` together when release status changes; verify the linked work record is public before deployment.

The visual system and restrained motion follow the [Impeccable design skill](https://github.com/pbakaus/impeccable), especially its guidance that animation should explain state and respect reduced-motion preferences. The hero illustration is HTML/CSS/SVG, so its content is localizable and remains visible without JavaScript.
