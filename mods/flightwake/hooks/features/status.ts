/**
 * /fw-mod — what each of the five features is doing right now and why (2026-10-05 field feedback: the mod is
 * designed not to interrupt, so after installing nobody could tell whether it had loaded or which features were
 * acting). Read-only: it reads what the features themselves read (STATE, TRAPS, the instruction-file markers and the
 * seat block, settings) and the features' own $.state values; it changes nothing. Registered regardless of the five
 * switches — it is how you see them — but only in a folder where flightwake is installed.
 */
import type { EngineInterface, On } from 'claude-code'

import type { FwFlightLog, FwRoleGuard, FwStateSnapshot } from '../../types'
import { detectProfile, fwContext, isUninitializedState, legacyStatuslineActive, M, MOD_VERSION, readRel, STATE_REL, TRAPS_REL } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { parseSeatBlock } from '../lib/roles'
import { hasMatchers, isActive, parseTraps } from '../lib/traps'

export type Switches = { stateInject: boolean; band: boolean; recorder: boolean; tripwire: boolean; roleGuard: boolean }

// The Io closure over this file's `$` (IO_OF_TEMPLATE in hooks/lib/core.ts; `$` may not cross an import).
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

const SEAT_FILES = ['.claude/CLAUDE.md', 'CLAUDE.md'] as const
// The loader holds every $.state reference to literal plugin/key values written in this file
const SNAPSHOT_REF = { plugin: 'flightwake-mod', key: 'stateSnapshot' } as const
const LOG_REF = { plugin: 'flightwake-mod', key: 'flightLog' } as const
const GUARD_REF = { plugin: 'flightwake-mod', key: 'roleGuard' } as const

/** How to switch a feature on or off yourself (plugin options are not read from project settings). */
const howTo = (lang: Lang, key: keyof Switches, value: boolean): string => {
  const json = `"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "${key}": ${value} } } }`
  return M(lang, {
    en: `turn it ${value ? 'on' : 'off'} in /config, or in your user settings (~/.claude/settings.json): ${json}`,
    'zh-TW': `在 /config ${value ? '開啟' : '關閉'},或寫進你的使用者設定(~/.claude/settings.json):${json}`,
    'zh-CN': `在 /config ${value ? '开启' : '关闭'},或写进你的用户设置(~/.claude/settings.json):${json}`,
    ja: `/config で${value ? 'オン' : 'オフ'}にするか、ユーザー設定(~/.claude/settings.json)に:${json}`,
  })
}
const ON = (lang: Lang) => M(lang, { en: 'on', 'zh-TW': '開啟', 'zh-CN': '开启', ja: 'オン' })
const OFF = (lang: Lang) => M(lang, { en: 'off', 'zh-TW': '關閉', 'zh-CN': '关闭', ja: 'オフ' })
const IDLE = (lang: Lang) => M(lang, { en: 'idle', 'zh-TW': '閒置', 'zh-CN': '闲置', ja: '待機' })

const LABEL: Record<keyof Switches, Record<Lang, string>> = {
  stateInject: { en: 'STATE at session start', 'zh-TW': 'STATE 自動載入', 'zh-CN': 'STATE 自动载入', ja: 'STATE の自動読み込み' },
  band: { en: 'band above the prompt', 'zh-TW': '輸入框上方橫條', 'zh-CN': '输入框上方横条', ja: '入力欄上の帯' },
  recorder: { en: 'session flight log', 'zh-TW': 'session 行車記錄', 'zh-CN': 'session 行车记录', ja: 'セッション記録' },
  tripwire: { en: 'trap tripwire', 'zh-TW': '踩坑絆線', 'zh-CN': '踩坑绊线', ja: '落とし穴の検知線' },
  roleGuard: { en: 'role guard', 'zh-TW': '角色守門', 'zh-CN': '角色守门', ja: 'ロールガード' },
}
const line = (lang: Lang, key: keyof Switches, state: string, why: string): string => `- **${LABEL[key][lang]}** (\`${key}\`): ${state} — ${why}`

async function statusText($: EngineInterface, sw: Switches): Promise<string | null> {
  const io = ioOf($)
  const ctx = await fwContext(io)
  if (ctx === null) return null
  const { root, lang } = ctx
  const sid = await io.sessionId()
  const state = await readRel(io, root, STATE_REL)
  const out: string[] = []
  out.push(`## flightwake-mod v${MOD_VERSION}`, '')
  out.push(M(lang, {
    en: `language: ${lang} · profile: ${await detectProfile(io, root)} · root: ${root}`,
    'zh-TW': `語言(language): ${lang} · 類型(profile): ${await detectProfile(io, root)} · 根目錄: ${root}`,
    'zh-CN': `语言(language): ${lang} · 类型(profile): ${await detectProfile(io, root)} · 根目录: ${root}`,
    ja: `言語(language): ${lang} · 種別(profile): ${await detectProfile(io, root)} · ルート: ${root}`,
  }), '')

  // F1
  if (!sw.stateInject) out.push(line(lang, 'stateInject', OFF(lang), howTo(lang, 'stateInject', true)))
  else {
    let snap: FwStateSnapshot | null = null
    try { snap = (await $.state.get(SNAPSHOT_REF)).value ?? null } catch {}
    const isThisSession = snap !== null && snap.sessionId === sid && snap.text !== null
    out.push(line(lang, 'stateInject', ON(lang), state !== null && isUninitializedState(state)
      ? M(lang, { en: 'STATE is not initialized yet, so only a "run /fw-coldstart" note is injected', 'zh-TW': 'STATE 尚未初始化,所以只注入「請先跑 /fw-coldstart」的提示', 'zh-CN': 'STATE 尚未初始化,所以只注入「请先跑 /fw-coldstart」的提示', ja: 'STATE が未初期化のため「まず /fw-coldstart」という注記だけを注入' })
      : isThisSession
        ? M(lang, { en: 'STATE was injected into this session (a snapshot taken at session start)', 'zh-TW': '已在本 session 注入 STATE(session 開始時取的快照)', 'zh-CN': '已在本 session 注入 STATE(session 开始时取的快照)', ja: 'このセッションに STATE を注入済み(セッション開始時のスナップショット)' })
        : M(lang, { en: 'nothing injected yet in this session (it is taken when a session starts)', 'zh-TW': '本 session 尚未注入(在 session 開始時取得)', 'zh-CN': '本 session 尚未注入(在 session 开始时取得)', ja: 'このセッションではまだ注入していない(セッション開始時に取得)' })))
  }

  // F2
  if (!sw.band) out.push(line(lang, 'band', OFF(lang), howTo(lang, 'band', true)))
  else out.push(line(lang, 'band', ON(lang), (await legacyStatuslineActive(io))
    ? M(lang, { en: 'hiding the fields the bottom gauge already shows (health / STATE lag / context); only the one-time 80% context toast remains', 'zh-TW': '偵測到底部儀表,隱藏儀表已顯示的欄位(health/STATE 落後/context),只保留 context 80% 時的一次提示', 'zh-CN': '检测到底部仪表,隐藏仪表已显示的栏位(health/STATE 落后/context),只保留 context 80% 时的一次提示', ja: '下部ゲージを検出したため、ゲージが表示する欄(health / STATE の遅れ / context)を隠し、context 80% の一度きりのトーストだけ残す' })
    : M(lang, { en: 'shown above the prompt with health, STATE lag and context use (it stands in for the bottom gauge)', 'zh-TW': '顯示在輸入框上方:health、STATE 落後、context 用量(代替底部儀表)', 'zh-CN': '显示在输入框上方:health、STATE 落后、context 用量(代替底部仪表)', ja: '入力欄の上に health・STATE の遅れ・context 使用量を表示(下部ゲージの代わり)' })))

  // F3
  if (!sw.recorder) out.push(line(lang, 'recorder', OFF(lang), howTo(lang, 'recorder', true)))
  else {
    let raw: FwFlightLog | null = null
    try { raw = (await $.state.get(LOG_REF)).value ?? null } catch {}
    const log = raw !== null && raw.sessionId === sid ? raw : null
    const n = { files: log?.files.length ?? 0, shell: log?.shellFiles?.length ?? 0, tests: log?.tests.length ?? 0, commits: log?.commits.length ?? 0 }
    out.push(line(lang, 'recorder', ON(lang), M(lang, {
      en: `this session: ${n.files} file(s) by tools, ${n.shell} via shell (inferred), ${n.tests} test run(s), ${n.commits} commit(s) — /fw-log prints them`,
      'zh-TW': `本 session:工具改了 ${n.files} 個檔、shell 推斷 ${n.shell} 個、測試 ${n.tests} 次、commit ${n.commits} 個 — /fw-log 印出明細`,
      'zh-CN': `本 session:工具改了 ${n.files} 个文件、shell 推断 ${n.shell} 个、测试 ${n.tests} 次、commit ${n.commits} 个 — /fw-log 打印明细`,
      ja: `このセッション:ツールで ${n.files} 件、シェル推定 ${n.shell} 件、テスト ${n.tests} 回、commit ${n.commits} 件 — /fw-log で詳細`,
    })))
  }

  // F4
  if (!sw.tripwire) out.push(line(lang, 'tripwire', OFF(lang), howTo(lang, 'tripwire', true)))
  else {
    const traps = await readRel(io, root, TRAPS_REL)
    const watched = traps === null ? 0 : parseTraps(traps).filter((t) => isActive(t) && hasMatchers(t)).length
    out.push(watched === 0
      ? line(lang, 'tripwire', IDLE(lang), M(lang, { en: 'no active TRAPS entry has paths or commands — add them to an entry to be warned (fw-trap explains the two fields)', 'zh-TW': 'TRAPS 裡沒有任何帶 paths 或 commands 的 active 條目 — 在條目加上這兩個欄位才會提示(fw-trap 有說明)', 'zh-CN': 'TRAPS 里没有任何带 paths 或 commands 的 active 条目 — 在条目加上这两个栏位才会提示(fw-trap 有说明)', ja: 'TRAPS に paths か commands を持つ active な項目がない — 項目にこの 2 欄を足すとヒントが出る(fw-trap に説明あり)' }))
      : line(lang, 'tripwire', ON(lang), M(lang, { en: `watching ${watched} TRAPS entr${watched === 1 ? 'y' : 'ies'} with paths / commands`, 'zh-TW': `監看 ${watched} 條帶 paths / commands 的 TRAPS 條目`, 'zh-CN': `监看 ${watched} 条带 paths / commands 的 TRAPS 条目`, ja: `paths / commands を持つ TRAPS 項目 ${watched} 件を監視中` })))
  }

  // F5
  const notBoundary = M(lang, { en: 'not a security boundary', 'zh-TW': '不是安全邊界', 'zh-CN': '不是安全边界', ja: 'セキュリティ境界ではない' })
  if (!sw.roleGuard) out.push(line(lang, 'roleGuard', OFF(lang), `${M(lang, { en: 'opt-in', 'zh-TW': '選配', 'zh-CN': '选配', ja: 'オプトイン' })}; ${howTo(lang, 'roleGuard', true)} (${notBoundary})`))
  else {
    let snap: FwRoleGuard | null = null
    try { snap = (await $.state.get(GUARD_REF)).value ?? null } catch {}
    let role: string | null = null
    let deny: string[] = []
    let source = 'seat'
    let released: string[] = []
    if (snap !== null && snap.sessionId === sid && snap.root === root) {
      role = snap.role; deny = snap.denyWrite; source = snap.source; released = snap.isAllReleased ? ['*all*'] : snap.released
    } else {
      for (const rel of SEAT_FILES) {
        const t = await readRel(io, root, rel)
        const seat = t === null ? null : parseSeatBlock(t)
        if (seat) { role = seat.id; deny = seat.denyWrite; break }
      }
    }
    if (role === null) out.push(line(lang, 'roleGuard', IDLE(lang), M(lang, { en: "this folder's Claude seat has no role (roles apply writes one into CLAUDE.md)", 'zh-TW': '這個資料夾的 Claude 座位沒有角色(roles apply 會寫進 CLAUDE.md)', 'zh-CN': '这个文件夹的 Claude 座位没有角色(roles apply 会写进 CLAUDE.md)', ja: 'このフォルダーの Claude の席にロールがない(roles apply が CLAUDE.md に書く)' })))
    else if (deny.length === 0) out.push(line(lang, 'roleGuard', IDLE(lang), M(lang, { en: `role ${role} has no deny-write line, so there is nothing to guard`, 'zh-TW': `角色 ${role} 沒有 deny-write,沒有要守的路徑`, 'zh-CN': `角色 ${role} 没有 deny-write,没有要守的路径`, ja: `ロール ${role} に deny-write がなく、守る対象がない` })))
    else out.push(line(lang, 'roleGuard', ON(lang), M(lang, {
      en: `role ${role} (${source}) blocks Edit/Write into ${deny.join(', ')}${released.length ? `; released this session: ${released.join(', ')}` : ''} (${notBoundary})`,
      'zh-TW': `角色 ${role}(${source})擋下 Edit/Write 寫入 ${deny.join(', ')}${released.length ? `;本 session 已放行:${released.join(', ')}` : ''}(${notBoundary})`,
      'zh-CN': `角色 ${role}(${source})挡下 Edit/Write 写入 ${deny.join(', ')}${released.length ? `;本 session 已放行:${released.join(', ')}` : ''}(${notBoundary})`,
      ja: `ロール ${role}(${source})が ${deny.join(', ')} への Edit/Write を止める${released.length ? `。このセッションで解除:${released.join(', ')}` : ''}(${notBoundary})`,
    })))
  }
  out.push('', M(lang, { en: 'Read-only: /fw-mod changes nothing.', 'zh-TW': '唯讀:/fw-mod 不改任何東西。', 'zh-CN': '只读:/fw-mod 不改任何东西。', ja: '読み取り専用:/fw-mod は何も変更しない。' }))
  return out.join('\n')
}

let isCommandRegistered = false
async function ensureCommand($: EngineInterface): Promise<void> {
  if (isCommandRegistered) return
  isCommandRegistered = true
  try {
    const ctx = await fwContext(ioOf($))
    if (ctx === null) { isCommandRegistered = false; return }
    await $.command.register({
      name: 'fw-mod',
      description: M(ctx.lang, {
        en: 'Show what each flightwake-mod feature is doing and why (read-only)',
        'zh-TW': '列出 flightwake-mod 各功能的狀態與原因(唯讀)',
        'zh-CN': '列出 flightwake-mod 各功能的状态与原因(只读)',
        ja: 'flightwake-mod の各機能の状態と理由を表示(読み取り専用)',
      }),
    })
  } catch {
    isCommandRegistered = false
  }
}

export function registerStatus(on: On, switches: Switches): void {
  on('session.start', {}, async ($, e, next) => {
    await ensureCommand($)
    return next(e)
  })
  on('command.run', { command: 'fw-mod' }, async ($, e, next) => {
    try {
      const text = await statusText($, switches)
      return text === null ? next(e) : { text }
    } catch {
      return next(e)
    }
  })
}
