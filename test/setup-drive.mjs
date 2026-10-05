#!/usr/bin/env node
/**
 * Test driver for `flightwake setup`: runs the real question flow (runSetup) against the real install context in
 * the current directory, feeding answers directly through the injected io instead of a terminal.
 *   node test/setup-drive.mjs [--flags='{"lang":"en"}'] [--orca=0|1] -- <answer> <answer> ...
 * Answer tokens: "" = press Enter; "^D" = EOF (stdin closed); "^C" = Ctrl-C. Running out of answers = EOF.
 * Prints every prompt and output line; exits with runSetup's exit code.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSetup, realContext, INTERRUPT } from '../bin/setup.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const opts = sep === -1 ? argv : argv.slice(0, sep);
const answers = sep === -1 ? [] : argv.slice(sep + 1);
const flags = JSON.parse(opts.find((a) => a.startsWith('--flags='))?.slice(8) ?? '{}');
const orca = opts.find((a) => a.startsWith('--orca='))?.slice(7);

const FW_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(FW_SRC, 'package.json'), 'utf8')).version;
const ctx = realContext({ target: process.cwd(), fwSrc: FW_SRC, version });
if (orca !== undefined) ctx.orcaDetected = () => orca === '1';

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
