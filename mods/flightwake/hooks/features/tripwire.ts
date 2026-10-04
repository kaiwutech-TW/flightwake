/**
 * F4 TRAPS tripwires: when an Edit/Write/NotebookEdit or Bash call matches an active TRAPS entry's `paths` or
 * `commands`, a compact hint is appended to the tool result's `context` (what the model reads after the result).
 * It NEVER blocks: a denied call passes through untouched, and every failure falls through to the plain result.
 * Contract: docs/plans/mods.md (revised) and the header of hooks/lib/core.ts. Read scope: .flightwake/TRAPS.md only.
 */
import { atom, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { M, fwContext, readRel, relToRoot, TRAPS_REL } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { matchAny } from '../lib/glob'
import { parseCommand, startsWithTokens } from '../lib/shell'
import { hasMatchers, isActive, parseTraps } from '../lib/traps'
import type { TrapEntry } from '../lib/traps'

const hinted = atom({ plugin: 'flightwake-mod', key: 'trapsHinted' } as const, null)

const MAX_ENTRIES = 5
const MAX_LINE = 300

function ioOf($: EngineInterface): Io {
  return {
    root: async () => { try { return (await $.session.root()).replace(/\/+$/, '') } catch { return '' } },
    sessionId: async () => { try { return await $.session.id() } catch { return '' } },
    exists: async (p) => { try { return await $.fs.exists(p) } catch { return false } },
    read: async (p) => {
      try { if (!(await $.fs.exists(p))) return null; const t = await $.fs.read(p); return typeof t === 'string' ? t : null } catch { return null }
    },
    git: async (args, cwd) => {
      try { const r = await $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: 5000 }); return r.exitCode === 0 ? r.stdout.trim() : null } catch { return null }
    },
    settings: async () => { try { return await $.settings.read({}) } catch { return {} } },
  }
}

type Hit = { entry: TrapEntry; via: string }

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** A bash word that plausibly names a repo file: has `/` or `.`, isn't an option, a URL or a home shorthand. */
function looksLikePath(t: string): boolean {
  if (t.startsWith('-') || t.startsWith('~') || t.includes('://') || t.includes('=')) return false
  return t.includes('/') || t.includes('.')
}

function matchFile(entries: TrapEntry[], root: string, filePath: string): Hit[] {
  const rel = relToRoot(root, filePath)
  if (rel === null || rel === '') return []
  const out: Hit[] = []
  for (const entry of entries) if (entry.paths.length && matchAny(entry.paths, rel) !== null) out.push({ entry, via: rel })
  return out
}

/**
 * Bash: command prefixes per segment, and path-like words resolved against every directory the shell could be in.
 * F4 only hints and hints once per entry per session, so when the cwd is uncertain it over-hints rather than miss:
 * - only a plain chain `cd X && …` is a certain move (the set of cwds is replaced);
 * - a `cd` followed by `||`, `&`, `|`, `;` or a newline, or after any such operator, may or may not have moved this
 *   shell: the moved directories are ADDED to the set;
 * - `( … )` subshells are walked: inside, cds apply as above; after the `)`, the set from before the `(` is back;
 * - a `cd` that can't be resolved without guessing (`cd -`, `~`, `$VAR`, bare `cd`) leaves the set as it is.
 */
function matchBash(entries: TrapEntry[], root: string, cwd0: string, command: string): Hit[] {
  const parsed = parseCommand(command)
  const out = new Map<TrapEntry, string>()
  let cwds = new Set<string>([cwd0])
  let isCertain = true
  const stack: Array<{ cwds: Set<string>; isCertain: boolean }> = []
  for (const seg of parsed.segments) {
    if (seg.group === 'open') {
      stack.push({ cwds: new Set(cwds), isCertain })
      continue
    }
    if (seg.group === 'close') {
      const saved = stack.pop()
      if (saved) ({ cwds, isCertain } = saved)
      if (seg.op && seg.op !== '&&') isCertain = false
      continue
    }
    for (const entry of entries) {
      if (out.has(entry)) continue
      const prefix = entry.commands.find((p) => startsWithTokens(seg.tokens, p))
      if (prefix !== undefined) {
        out.set(entry, prefix.trim().split(/\s+/).join(' '))
        continue
      }
      if (!entry.paths.length) continue
      search: for (const tok of seg.tokens) {
        if (!looksLikePath(tok)) continue
        for (const cwd of tok.startsWith('/') ? [''] : cwds) {
          const rel = relToRoot(root, tok.startsWith('/') ? tok : `${cwd}/${tok}`)
          if (rel !== null && rel !== '' && matchAny(entry.paths, rel) !== null) {
            out.set(entry, rel)
            break search
          }
        }
      }
    }
    if (seg.tokens[0] === 'cd') {
      const dir = seg.tokens[1]
      const isResolvable = seg.tokens.length === 2 && dir !== undefined && dir !== '-' && !dir.startsWith('~') && !dir.includes('$')
      if (isResolvable) {
        const moved = [...cwds].map((c) => (dir.startsWith('/') ? dir : `${c}/${dir}`))
        cwds = isCertain && seg.op === '&&' ? new Set(moved) : new Set([...cwds, ...moved])
      }
    }
    if (seg.op && seg.op !== '&&') isCertain = false
  }
  return [...out].map(([entry, via]) => ({ entry, via }))
}

const clip = (s: string): string => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE)}…` : s)

function render(lang: Lang, shown: Hit[], more: number): string {
  const lines: string[] = []
  let isLead = false
  for (const { entry, via } of shown) {
    if (entry.confidence !== 'confirmed') isLead = true
    lines.push(
      M(lang, {
        en: `flightwake TRAPS: \`${entry.name}\` [${entry.confidence}] matches ${via}`,
        'zh-TW': `flightwake TRAPS:\`${entry.name}\` [${entry.confidence}] 命中 ${via}`,
        'zh-CN': `flightwake TRAPS:\`${entry.name}\` [${entry.confidence}] 命中 ${via}`,
        ja: `flightwake TRAPS: \`${entry.name}\` [${entry.confidence}] が ${via} に該当`,
      }),
    )
    const detail = [entry.labelled[1], entry.labelled[2]].filter((l): l is string => !!l)
    if (detail.length) for (const l of detail) lines.push(`  ${clip(l)}`)
    else if (entry.body) lines.push(`  ${clip(entry.body.replace(/\s+/g, ' '))}`)
  }
  if (more > 0) {
    lines.push(M(lang, { en: `+${more} more`, 'zh-TW': `另有 ${more} 條`, 'zh-CN': `另有 ${more} 条`, ja: `ほか ${more} 件` }))
  }
  lines.push(M(lang, {
    en: 'This note arrives after this call ran: it cannot stop this one; it is for the next time you touch this.',
    'zh-TW': '這則提示在本次呼叫執行之後才出現:它擋不了這一次,是提醒你下一次碰到這裡時注意。',
    'zh-CN': '这则提示在本次调用执行之后才出现:它拦不住这一次,是提醒你下一次碰到这里时注意。',
    ja: 'この注意は今回の呼び出しが実行された後に届きます。今回は防げません。次にここに触れるときのためのものです。',
  }))
  lines.push(M(lang, { en: `Full entry: ${TRAPS_REL}`, 'zh-TW': `完整條目:${TRAPS_REL}`, 'zh-CN': `完整条目:${TRAPS_REL}`, ja: `全文: ${TRAPS_REL}` }))
  if (isLead) {
    lines.push(
      M(lang, {
        en: 'Note: probable/suspected/unknown entries are leads, not settled facts. Verify before relying on them, and never use one to argue that something is safe.',
        'zh-TW': '注意:probable/suspected/unknown 的條目是線索,不是定論。採信前先驗證,也不可拿它來論證某件事是安全的。',
        'zh-CN': '注意:probable/suspected/unknown 的条目是线索,不是定论。采信前先验证,也不可拿它来论证某件事是安全的。',
        ja: '注意: probable/suspected/unknown のエントリは手がかりであり確定事項ではありません。依拠する前に検証し、安全性の根拠には使わないでください。',
      }),
    )
  }
  return lines.join('\n')
}

/** The hint to append for this call, or null. May take `$` because it is declared in this file. */
async function hintFor($: EngineInterface, e: Record<string, unknown>): Promise<string | null> {
  const tool = e.tool
  const isFile = tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit'
  if (!isFile && tool !== 'Bash') return null
  const target = isFile ? (str(e.file_path) ?? str(e.notebook_path)) : str(e.command)
  if (target === null) return null

  const io = ioOf($)
  const ctx = await fwContext(io)
  if (ctx === null) return null
  const text = await readRel(io, ctx.root, TRAPS_REL)
  if (text === null) return null
  const entries = parseTraps(text).filter((t) => isActive(t) && hasMatchers(t))
  if (!entries.length) return null

  let cwd0 = ctx.root
  if (!isFile) {
    try { cwd0 = (await $.session.cwd()).replace(/\/+$/, '') || ctx.root } catch {}
  }
  const hits = isFile ? matchFile(entries, ctx.root, target) : matchBash(entries, ctx.root, cwd0, target)
  if (!hits.length) return null

  const sessionId = await io.sessionId()
  const key = (h: Hit) => `${h.entry.name}@${h.entry.version}`
  let shown: Hit[] = []
  let more = 0
  await update($, hinted, (cur) => {
    const seen = cur && cur.sessionId === sessionId ? cur.keys : []
    const fresh = hits.filter((h) => !seen.includes(key(h)))
    shown = fresh.slice(0, MAX_ENTRIES)
    more = fresh.length - shown.length
    return { sessionId, keys: [...seen, ...shown.map(key)] }
  })
  if (!shown.length) return null
  return render(ctx.lang, shown, more)
}

export function registerTripwire(on: On): void {
  on('tool.call', {}, async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    try {
      const hint = await hintFor($, e as Record<string, unknown>)
      if (hint !== null) return { ...r, context: [...(r.context ?? []), hint] }
    } catch {
      // a failing tripwire never touches the person's work
    }
    return r
  })
}
