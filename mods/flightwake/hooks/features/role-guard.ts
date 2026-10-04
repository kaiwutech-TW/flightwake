/**
 * F5 — opt-in role guard (userConfig `roleGuard`, off by default).
 *
 * One machine-readable rule only: the role body's own `deny-write: [glob, …]` line (hooks/lib/roles.ts). It blocks
 * the MAIN session's Edit/Write/NotebookEdit into those paths. Natural-language "Never" bullets are never compiled
 * into rules, no shell blacklist, Bash/MCP/Read are never touched. Subagents (an explicit assignment) are not
 * checked; a dispatch card at the start of a prompt replaces the seat role for this session. The role is a
 * snapshot per session id (a /clear is a new id: re-read lazily on the next tool call); edits to the role files
 * take effect in a new session. Release: `/fw-role-release`, accepted only from the person's own composer input.
 * This is a convenience, not a security boundary — the deny message and docs/roles.md say so.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { FwRoleGuard } from '../../types'
import { detectLang, M, readRel, relToRoot, type Io, type Lang } from '../lib/core'
import { matchAny } from '../lib/glob'
import { parseCard, parseSeatBlock } from '../lib/roles'

// Pasted from IO_OF_TEMPLATE (hooks/lib/core.ts): `$` cannot cross an import, so each feature file builds its own.
function ioOf($: EngineInterface): Io {
  return {
    root: async () => { try { return (await $.session.root()).replace(/\/+$/, '') } catch { return '' } },
    sessionId: async () => { try { return await $.session.id() } catch { return '' } },
    exists: async (p) => { try { return await $.fs.exists(p) } catch { return false } },
    read: async (p) => {
      try { if (!(await $.fs.exists(p))) return null; const t = await $.fs.read(p); return typeof t === 'string' ? t : null } catch { return null }
    },
    git: async (args, cwd) => {
      try { const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 }); return r.exitCode === 0 ? r.stdout.trim() : null } catch { return null }
    },
    settings: async () => { try { return await $.settings.read({}) } catch { return {} } },
  }
}

const guardAtom = atom({ plugin: 'flightwake-mod', key: 'roleGuard' } as const, null)

/** Seat files in roles.mjs order (.claude/CLAUDE.md first); the first one holding a roles block wins. */
const SEAT_FILES = ['.claude/CLAUDE.md', 'CLAUDE.md'] as const

async function readSeat(io: Io, root: string, sid: string): Promise<FwRoleGuard> {
  for (const rel of SEAT_FILES) {
    const t = await readRel(io, root, rel)
    if (t === null) continue
    const seat = parseSeatBlock(t)
    if (seat) return { sessionId: sid, role: seat.id, source: 'seat', denyWrite: seat.denyWrite, released: [] }
  }
  return { sessionId: sid, role: null, source: 'none', denyWrite: [], released: [] }
}

/** This session's snapshot: the stored one when it carries the current id, else read the seat and store it. */
async function ensureSnapshot($: EngineInterface, io: Io, root: string, sid: string): Promise<FwRoleGuard> {
  const stored = await read($, guardAtom)
  if (stored && stored.sessionId === sid) return stored
  const fresh = await readSeat(io, root, sid)
  await update($, guardAtom, () => fresh)
  return fresh
}

const isReleased = (g: FwRoleGuard, glob: string): boolean => g.released.includes('*') || g.released.includes(glob)

const sourceLabel = (lang: Lang, s: FwRoleGuard['source']): string =>
  s === 'card'
    ? M(lang, { en: 'dispatch card', 'zh-TW': '派工卡', 'zh-CN': '派活卡', ja: '割り振りカード' })
    : M(lang, { en: 'seat', 'zh-TW': '座位', 'zh-CN': '座位', ja: '席' })

function releasedText(lang: Lang, g: FwRoleGuard): string {
  const what = g.released.includes('*')
    ? M(lang, { en: 'all rules', 'zh-TW': '全部規則', 'zh-CN': '全部规则', ja: 'すべてのルール' })
    : g.released.join(', ')
  return M(lang, {
    en: `⚠ role guard released: ${what} (this session)`,
    'zh-TW': `⚠ 角色守門已放行:${what}(本 session)`,
    'zh-CN': `⚠ 角色守门已放行:${what}(本 session)`,
    ja: `⚠ ロールガード解除中:${what}(この session)`,
  })
}

/** Persistent status line while releases exist; cleared otherwise. */
function showStatus($: EngineInterface, lang: Lang, g: FwRoleGuard): void {
  try {
    $.ui.status(g.released.length > 0 ? releasedText(lang, g) : undefined)
  } catch {}
}

/** A visible trace in the transcript (a notice the model never reads). Silent when the engine refuses it. */
async function trace($: EngineInterface, text: string): Promise<void> {
  try {
    await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })
  } catch {}
}

function listText(lang: Lang, g: FwRoleGuard): string {
  const head = M(lang, {
    en: `role guard — role: ${g.role}, from the ${sourceLabel(lang, g.source)}`,
    'zh-TW': `角色守門——角色:${g.role},來源:${sourceLabel(lang, g.source)}`,
    'zh-CN': `角色守门——角色:${g.role},来源:${sourceLabel(lang, g.source)}`,
    ja: `ロールガード — ロール:${g.role}(${sourceLabel(lang, g.source)}由来)`,
  })
  const none = M(lang, { en: '(none)', 'zh-TW': '(無)', 'zh-CN': '(无)', ja: '(なし)' })
  const rules = g.denyWrite.map((r, i) => {
    const mark = isReleased(g, r) ? M(lang, { en: ' [released]', 'zh-TW': ' [已放行]', 'zh-CN': ' [已放行]', ja: ' [解除中]' }) : ''
    return `  ${i + 1}. ${r}${mark}`
  })
  const usage = M(lang, {
    en: 'Usage: /fw-role-release <glob|number>  ·  all  ·  revoke',
    'zh-TW': '用法:/fw-role-release <glob|編號>  ·  all  ·  revoke',
    'zh-CN': '用法:/fw-role-release <glob|编号>  ·  all  ·  revoke',
    ja: '使い方:/fw-role-release <glob|番号>  ·  all  ·  revoke',
  })
  return [head, ...(rules.length ? rules : [`  ${none}`]), usage].join('\n')
}

async function runRelease($: EngineInterface, io: Io, args: string): Promise<string> {
  const root = await io.root()
  const lang = root ? await detectLang(io, root) : 'en'
  const sid = await io.sessionId()
  const g = root ? await ensureSnapshot($, io, root, sid) : null
  if (!g || g.role === null || g.denyWrite.length === 0) {
    return M(lang, {
      en: 'role guard: nothing to release (no role in force, or its role has no deny-write rules).',
      'zh-TW': '角色守門:沒有可放行的項目(目前沒有角色,或該角色沒有 deny-write 規則)。',
      'zh-CN': '角色守门:没有可放行的项目(当前没有角色,或该角色没有 deny-write 规则)。',
      ja: 'ロールガード:解除するものはありません(ロールがないか、そのロールに deny-write ルールがありません)。',
    })
  }
  const arg = args.trim()
  if (arg === '') return listText(lang, g)

  let next: string[]
  let done: string
  if (arg === 'revoke') {
    next = []
    done = M(lang, {
      en: 'role guard: releases revoked, rules apply again.',
      'zh-TW': '角色守門:已收回放行,規則恢復生效。',
      'zh-CN': '角色守门:已收回放行,规则恢复生效。',
      ja: 'ロールガード:解除を取り消しました。ルールが再び有効です。',
    })
  } else {
    let glob: string | null
    if (arg === 'all') glob = '*'
    else if (/^\d+$/.test(arg)) glob = g.denyWrite[Number(arg) - 1] ?? null
    else glob = g.denyWrite.includes(arg) ? arg : null
    if (glob === null) {
      return (
        M(lang, {
          en: `role guard: "${arg}" is not one of this role's rules.`,
          'zh-TW': `角色守門:「${arg}」不是此角色的規則之一。`,
          'zh-CN': `角色守门:「${arg}」不是此角色的规则之一。`,
          ja: `ロールガード:「${arg}」はこのロールのルールではありません。`,
        }) +
        '\n' +
        listText(lang, g)
      )
    }
    next = glob === '*' ? ['*'] : [...new Set([...g.released.filter((r) => r !== '*'), glob])]
    const label =
      glob === '*' ? M(lang, { en: 'all rules', 'zh-TW': '全部規則', 'zh-CN': '全部规则', ja: 'すべてのルール' }) : glob
    done = M(lang, {
      en: `role guard: released ${label} for this session.`,
      'zh-TW': `角色守門:本 session 已放行 ${label}。`,
      'zh-CN': `角色守门:本 session 已放行 ${label}。`,
      ja: `ロールガード:この session では ${label} を解除しました。`,
    })
  }
  const after: FwRoleGuard = { ...g, released: next }
  await update($, guardAtom, (cur) => (cur && cur.sessionId === sid ? { ...cur, released: next } : after))
  showStatus($, lang, after)
  await trace($, done)
  return done
}

export function registerRoleGuard(on: On): void {
  on('session.start', {}, async ($, e, next) => {
    try {
      const io = ioOf($)
      const root = await io.root()
      if (root) {
        const lang = await detectLang(io, root)
        try {
          await $.command.register({
            name: 'fw-role-release',
            description: M(lang, {
              en: 'Release the role guard (deny-write rules) for this session',
              'zh-TW': '放行本 session 的角色守門(deny-write 規則)',
              'zh-CN': '放行本 session 的角色守门(deny-write 规则)',
              ja: 'この session のロールガード(deny-write ルール)を解除する',
            }),
            argumentHint: '[glob|number|all|revoke]',
          })
        } catch {}
        const sid = await io.sessionId()
        // Reload keeps the stored snapshot (role and releases); a new session id re-reads the seat.
        const g = await ensureSnapshot($, io, root, sid)
        if (g.released.length > 0) showStatus($, lang, g)
      }
    } catch {}
    return next(e)
  })

  on('prompt.submit', {}, async ($, e, next) => {
    try {
      if (e.origin?.kind !== 'plugin') {
        const card = parseCard(e.text)
        if (card) {
          const io = ioOf($)
          const sid = await io.sessionId()
          const root = await io.root()
          if (root) {
            const lang = await detectLang(io, root)
            const g: FwRoleGuard = { sessionId: sid, role: card.id, source: 'card', denyWrite: card.denyWrite, released: [] }
            await update($, guardAtom, () => g)
            showStatus($, lang, g)
          }
        }
      }
    } catch {}
    return next(e)
  })

  on('tool.call', {}, async ($, e, next) => {
    try {
      // Main loop only: a subagent (incl. a spawned on-call role) is an explicit assignment that overrides the seat.
      if (e.agentId !== undefined) return next(e)
      let target: string | undefined
      if (e.tool === 'Edit' || e.tool === 'Write') target = e.file_path
      else if (e.tool === 'NotebookEdit') target = e.notebook_path
      if (typeof target !== 'string' || target === '') return next(e)

      const io = ioOf($)
      const root = await io.root()
      if (!root) return next(e)
      const rel = relToRoot(root, target)
      if (rel === null || rel === '') return next(e)
      const g = await ensureSnapshot($, io, root, await io.sessionId())
      if (g.role === null || g.denyWrite.length === 0) return next(e)
      const glob = matchAny(g.denyWrite, rel)
      if (glob === null || isReleased(g, glob)) return next(e)

      const lang = await detectLang(io, root)
      const src = sourceLabel(lang, g.source)
      return {
        deny: M(lang, {
          en: `Role guard: this session's role "${g.role}" (from the ${src}) may not write ${rel} (rule deny-write: ${glob}). Dispatch the work to the role that owns it, or call an on-call role or a worker (\`npx flightwake roles card <id>\`); or ask the user to run /fw-role-release ${glob} for this session. This guard is a convenience, not a security boundary: Bash and other tools are not checked.`,
          'zh-TW': `角色守門:本 session 的角色「${g.role}」(來自${src})不可寫入 ${rel}(規則 deny-write: ${glob})。請把這件事派給負責的角色,或召喚待命角色/用 \`npx flightwake roles card <id>\` 派給 worker;也可以請使用者對本 session 執行 /fw-role-release ${glob}。這道守門只是個方便,不是安全邊界:Bash 與其他工具不受檢查。`,
          'zh-CN': `角色守门:本 session 的角色「${g.role}」(来自${src})不可写入 ${rel}(规则 deny-write: ${glob})。请把这件事派给负责的角色,或召唤待命角色/用 \`npx flightwake roles card <id>\` 派给 worker;也可以请用户对本 session 执行 /fw-role-release ${glob}。这道守门只是个方便,不是安全边界:Bash 与其他工具不受检查。`,
          ja: `ロールガード:この session のロール「${g.role}」(${src}由来)は ${rel} を書き込めません(ルール deny-write: ${glob})。担当のロールに割り振るか、オンコールロールを呼ぶか、\`npx flightwake roles card <id>\` で worker に渡してください。または本人にこの session で /fw-role-release ${glob} を実行してもらってください。このガードは便宜であってセキュリティ境界ではありません:Bash などほかのツールは検査されません。`,
        }),
      }
    } catch {
      return next(e)
    }
  })

  on('command.run', { command: 'fw-role-release' }, async ($, e, next) => {
    try {
      const io = ioOf($)
      // Only the person's own Enter at the prompt: not a plugin, the bridge, a peer, a schedule, or anything the model can cause.
      // (The engine always stamps an origin; an absent one only occurs when a test drives the engine's own `$`, which
      // stands for the REPL — every other kind, plugin included, is refused.)
      if (e.origin !== undefined && e.origin.kind !== 'composer') {
        const root = await io.root()
        const lang = root ? await detectLang(io, root) : 'en'
        return {
          text: M(lang, {
            en: 'role guard: /fw-role-release only works when you type it yourself in the prompt. Nothing changed.',
            'zh-TW': '角色守門:/fw-role-release 只接受你自己在輸入框打出的指令。未做任何變更。',
            'zh-CN': '角色守门:/fw-role-release 只接受你自己在输入框里敲出的命令。未做任何更改。',
            ja: 'ロールガード:/fw-role-release は、あなた自身がプロンプトに入力したときだけ有効です。何も変更していません。',
          }),
        }
      }
      return { text: await runRelease($, io, e.args) }
    } catch {
      return next(e)
    }
  })
}
