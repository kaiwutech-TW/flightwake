#!/usr/bin/env node
/**
 * Test driver for `flightwake setup`: runs the real question flow (runSetup) against the real install context in
 * the current directory, feeding answers directly through the injected io instead of a terminal.
 *   node test/setup-drive.mjs [--flags='{"lang":"en"}'] [--orca=0|1|path] [--locale='{"LANG":"zh_TW.UTF-8"}']
 *                             [--intl=<tag>] [--claude=<version>|none] [--user-statusline=0|1] -- <answer> <answer> ...
 * Answer tokens: "" = press Enter; "^D" = EOF (stdin closed); "^C" = Ctrl-C. Running out of answers = EOF.
 * Machine-dependent detection is pinned by default, so a run never depends on the developer's machine:
 *   --orca             0 = not detected (default, even when absent) · 1 = inside Orca (ORCA_* env) · path = only an
 *                      `orca` binary on PATH (shown, not preselected)
 *   --locale / --intl  the env (JSON) and Intl tag fed to detectLocale; default {} and no Intl → en, source none
 *   --claude           what `claude --version` reports; default none (unknown — the driver never spawns claude; setup's doctor step reads it through ctx too)
 *   --user-statusline  1 = ~/.claude/settings.json has a personal statusLine; default 0
 * Prints every prompt and output line; exits with runSetup's exit code.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup, realContext, INTERRUPT } from '../bin/setup.mjs';
import { detectLocale } from '../bin/install.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const opts = sep === -1 ? argv : argv.slice(0, sep);
const answers = sep === -1 ? [] : argv.slice(sep + 1);
const opt = (name) => opts.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flags = JSON.parse(opt('flags') ?? '{}');
const orca = opt('orca') ?? '0';
const ORCA = { 0: null, 1: 'env', path: 'path' };
if (!Object.hasOwn(ORCA, orca)) { console.error(`setup-drive: --orca must be 0, 1 or path (got ${orca})`); process.exit(2); }
const localeEnv = JSON.parse(opt('locale') ?? '{}');
const intl = opt('intl') ?? null;
const claude = opt('claude') ?? 'none';
const userSL = opt('user-statusline') ?? '0';

const FW_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(FW_SRC, 'package.json'), 'utf8')).version;
const ctx = realContext({ target: process.cwd(), fwSrc: FW_SRC, version });
ctx.orcaSource = () => ORCA[orca];
ctx.detectLocale = () => detectLocale(localeEnv, () => intl);
ctx.claudeVersion = () => (claude === 'none' ? null : claude);
ctx.userStatusline = () => userSL === '1';

let eof = false;
const io = {
  ask: async (prompt) => {
    process.stdout.write(prompt);
    if (eof || !answers.length) { eof = true; process.stdout.write('<EOF>\n'); return null; }
    const a = answers.shift();
    if (a === '^D') { eof = true; process.stdout.write('<EOF>\n'); return null; }
    if (a === '^C') { process.stdout.write('<^C>\n'); throw INTERRUPT; }
    process.stdout.write(`${a}\n`);
    return a;
  },
  out: (s) => process.stdout.write(`${s}\n`),
};
process.exit(await runSetup({ io, flags, ctx }));
