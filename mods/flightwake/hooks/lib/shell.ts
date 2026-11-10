/**
 * A deliberately small shell-command reader for F3 (test recognition) and F4 (command tripwires).
 * It is NOT a shell parser: it splits on top-level control operators outside quotes and tokenizes each simple
 * command. Anything it can't read plainly is flagged (`isComplex`) so callers can stay conservative.
 * The reader lives in the shared TRAPS core (traps-core.mjs); F3's own cwd policy (shellWriteTargets) stays here.
 */
import { isPathWord, parseCommand, segmentWrites } from './traps-core.mjs'
import type { SegmentWrite } from './traps-core.mjs'

export { parseCommand, segmentWrites, startsWithTokens } from './traps-core.mjs'
export type { ParsedCommand, Segment, SegmentWrite } from './traps-core.mjs'

/**
 * A file a command writes or removes, as far as its words say. `dir` is where a relative `path` resolves: '' = the
 * command's starting directory, 'pkg' or '/abs' after a leading `cd … &&` chain, null = no longer certain (any other cd,
 * or a cd inside a subshell, happened earlier) — the caller must not resolve a relative path then.
 */
export type ShellWrite = SegmentWrite & { dir: string | null }

/**
 * The write targets plainly readable from a command (F3's "changed through shell commands" list): segmentWrites for
 * each segment, with the directory it runs in when a plain `cd X &&` chain makes that certain (null otherwise).
 * Only a candidate list — the recorder lists what git confirms as changed.
 */
export function shellWriteTargets(command: string): ShellWrite[] {
  const out: ShellWrite[] = []
  let dir: string | null = ''
  let isChainCertain = true // every segment so far ended with && (a cd here is a certain move)
  let depth = 0
  for (const seg of parseCommand(command).segments) {
    if (seg.group === 'open') { depth++; continue }
    if (seg.group === 'close') { depth = Math.max(0, depth - 1); if (seg.op && seg.op !== '&&') isChainCertain = false; continue }
    const t = seg.tokens
    // the words with redirections and their operands left out (as segmentWrites reads them)
    const words = t.filter((tok, i) => !/^(?:(?:\d*|&)>>?|\d*<)$/.test(t[i - 1] ?? '') && !/^(?:\d*|&)>>?/.test(tok) && !/^\d*</.test(tok))
    if (words[0] === 'cd') {
      const args = words.slice(1)
      const target = args[0] === '--' ? args[1] : args[0]
      const isResolvable = target !== undefined && args.length <= (args[0] === '--' ? 2 : 1) && target !== '-' && isPathWord(target)
      dir = depth === 0 && isChainCertain && seg.op === '&&' && isResolvable && dir !== null
        ? (target.startsWith('/') ? target : dir ? `${dir}/${target}` : target)
        : null
    } else {
      for (const w of segmentWrites(t)) out.push({ ...w, dir })
    }
    if (seg.op !== '&&') isChainCertain = false
  }
  return out
}
