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

On the first visit to `/`, a small inline script uses the browser's language preferences to choose a supported locale (`zh-Hant`/TW/HK/MO → 繁中, `zh-Hans`/CN/SG → 简中, `ja` → 日本語, `en` → English; other languages → English). It saves the choice in local storage and preserves the URL's query and hash when redirecting. A language-menu click replaces the saved choice. Explicit locale URLs never redirect, and without JavaScript `/` remains the crawlable Traditional Chinese page. The site reads browser preferences, which may differ from the operating system language.

## Cloudflare Pages

The `flightwake` Cloudflare Pages project is a **Direct Upload** project. Build the site locally, then deploy the generated `dist/` directory from the repository root:

```sh
npm --prefix website ci
npm --prefix website run check
npm --prefix website run build
npx wrangler pages deploy website/dist --project-name flightwake --branch main
```

Run Wrangler from the repository root, outside `website/`. Wrangler 4.149.0 interpreted `pages project create` from the Astro directory as a Workers setup and changed local files; see `.flightwake/TRAPS.md`. The Pages project already exists, so do not run that create command again.

The deployment is available at `https://flightwake.pages.dev`. Attach `flightwake.kaiwu.com.tw` as a Pages custom domain and create a proxied CNAME from `flightwake` to `flightwake.pages.dev` in the `kaiwu.com.tw` DNS zone. The custom domain serves traffic after Cloudflare verifies the record.

The build settings, if recreating the project with Git integration, are:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `website` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `SITE_URL=https://flightwake.kaiwu.com.tw` |
| Node.js version | `22` (`NODE_VERSION=22` if the Pages build environment does not read `.node-version`) |

`SITE_URL` defaults to `https://flightwake.kaiwu.com.tw`; set the same value in Pages for explicitness. It feeds canonical URLs, `hreflang`, the sitemap, `robots.txt`, `llms.txt`, and the Open Graph image URL. Rebuild if the domain changes.

This is a fully static build and needs no Cloudflare adapter or server-side runtime. The source is tracked in GitHub, and `.github/workflows/website.yml` checks site changes. Direct Upload does not redeploy on GitHub pushes; deploy with the command above after changing the site. Cloudflare does not allow switching this Pages project to Git integration later. If automatic deployment is wanted, create a separate Git-integrated Pages project or add a GitHub Actions deployment job with a scoped Cloudflare API token. The site does not publish the flightwake npm package.

## Release copy

The site currently presents the published npm 0.16.0 release and the optional Claude Code mod 0.2.0. The mod demo excerpts are in `src/modCaptures.ts`: setup ran through `test/setup-drive.mjs` with supplied answers, `/fw-mod` ran in an interactive Claude Code 2.1.296 session inside an isolated installed repo, and `fleet` used controlled session data shaped after `test/smoke.sh`. Temporary paths are redacted and Markdown formatting is flattened for the site's terminal frame. Some Fleet real-session cases remain unverified. Update `src/content.ts`, `src/layouts/Base.astro`, and `src/pages/llms.txt.ts` together when release status changes; verify the linked work record is public before deployment.

The visual system and restrained motion follow the [Impeccable design skill](https://github.com/pbakaus/impeccable), especially its guidance that animation should explain state and respect reduced-motion preferences. The hero illustration is HTML/CSS/SVG, so its content is localizable and remains visible without JavaScript.
