/**
 * F8 side panel — pure helpers: the STATE digest the panel draws (the "In progress" and "Next entry points" items)
 * and every panel message in the four install languages. No `$` here (hooks/lib/core.ts: `$` may not cross an
 * import); features/panel.ts reads the world and calls these.
 */
import { parseFrontmatter } from './core'
import type { Lang } from './core'

export const PANE_ID = 'flightwake'
/** $.store key: the person's last word on the panel (true = they opened it, false = they closed it). */
export const STORE_KEY = 'panelOpen'
export const CAP_IN_PROGRESS = 5
export const CAP_NEXT = 6
const ITEM_MAX = 240

/**
 * Section headings as the four STATE templates spell them (templates/<lang>/STATE.md), matched by prefix so a
 * repo's own suffix ("(don't delete until done)") or a later edit of it still matches.
 */
const IN_PROGRESS_HEADS = ['In progress', '進行中', '进行中']
const NEXT_HEADS = ['Next entry points', 'Next', '下一步入口', '次の入口']

const HEADING_RE = /^#{1,2}\s+(.+?)\s*$/
/** A top-level list item: `- x`, `* x`, `+ x`, `1. x`, `0a. x`, `2) x`. Indented lines are continuations. */
const ITEM_RE = /^(?:[-*+]|\d+[a-z]?[.)])\s+(.*)$/

/** One line of Markdown as plain text: checkboxes, emphasis, code ticks, wiki and inline links reduced to their words. */
export function plainItem(s: string): string {
  const t = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const cps = Array.from(t)
  return cps.length <= ITEM_MAX ? t : `${cps.slice(0, ITEM_MAX - 1).join('')}…`
}

export type StateDigest = {
  updated: string | null
  inProgress: string[]
  next: string[]
  moreInProgress: number
  moreNext: number
}

/** The digest of a STATE text: its `updated` field and the top-level items of the two sections, capped. */
export function stateDigest(text: string): StateDigest {
  const front = parseFrontmatter(text)
  const updated = front?.updated && front.updated !== '' ? front.updated : null
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').replace(/<!--[\s\S]*?-->/g, '')
  const inProgress: string[] = []
  const next: string[] = []
  let into: string[] | null = null
  let isFenced = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { isFenced = !isFenced; continue }
    if (isFenced) continue
    const h = HEADING_RE.exec(line)
    if (h && h[1] !== undefined) {
      const title = h[1]
      into = IN_PROGRESS_HEADS.some((p) => title.startsWith(p)) ? inProgress
        : NEXT_HEADS.some((p) => title.startsWith(p)) ? next
          : null
      continue
    }
    if (into === null) continue
    const m = ITEM_RE.exec(line)
    if (!m || m[1] === undefined) continue
    const item = plainItem(m[1])
    if (item !== '') into.push(item)
  }
  return {
    updated,
    inProgress: inProgress.slice(0, CAP_IN_PROGRESS),
    next: next.slice(0, CAP_NEXT),
    moreInProgress: Math.max(0, inProgress.length - CAP_IN_PROGRESS),
    moreNext: Math.max(0, next.length - CAP_NEXT),
  }
}

/** `/fw-panel [on|off]` → what to do; anything else toggles. */
export function panelVerb(args: string): 'on' | 'off' | 'toggle' {
  const a = args.trim().toLowerCase()
  return a === 'on' || a === 'open' ? 'on' : a === 'off' || a === 'close' ? 'off' : 'toggle'
}

type L<V> = Record<Lang, V>
const L4 = <V>(m: L<V>): L<V> => m

export const T = {
  title: L4({ en: 'flightwake', 'zh-TW': 'flightwake', 'zh-CN': 'flightwake', ja: 'flightwake' }),
  description: L4({
    en: 'Open or close the flightwake side panel (STATE, this session, cost, other sessions)',
    'zh-TW': '開關 flightwake 側邊面板(STATE、本 session、費用、其他 session)',
    'zh-CN': '开关 flightwake 侧边面板(STATE、本 session、费用、其他 session)',
    ja: 'flightwake サイドパネルの開閉(STATE・このセッション・コスト・他のセッション)',
  }),
  opened: L4({
    en: 'flightwake panel opened. It reopens by itself in later sessions (beside the transcript from 110 columns) until you close it; /fw-panel again closes it.',
    'zh-TW': 'flightwake 面板已開啟。之後的 session 會自動再開(終端機 110 欄以上時在對話旁邊),直到你關掉它;再打一次 /fw-panel 關閉。',
    'zh-CN': 'flightwake 面板已打开。之后的 session 会自动再开(终端 110 栏以上时在对话旁边),直到你关掉它;再打一次 /fw-panel 关闭。',
    ja: 'flightwake パネルを開きました。閉じるまで以後のセッションでも自動で開きます(110 列以上なら会話の横)。もう一度 /fw-panel で閉じます。',
  }),
  waiting: L4<(reason: string) => string>({
    en: (r) => `flightwake panel is open but not drawn yet: ${r}`,
    'zh-TW': (r) => `flightwake 面板已開啟但尚未顯示:${r}`,
    'zh-CN': (r) => `flightwake 面板已打开但尚未显示:${r}`,
    ja: (r) => `flightwake パネルは開いていますがまだ表示されていません:${r}`,
  }),
  closed: L4({
    en: 'flightwake panel closed; it will not open by itself again. /fw-panel brings it back.',
    'zh-TW': 'flightwake 面板已關閉,之後不會再自動開啟。/fw-panel 可再叫出來。',
    'zh-CN': 'flightwake 面板已关闭,之后不会再自动打开。/fw-panel 可再叫出来。',
    ja: 'flightwake パネルを閉じました。以後は自動で開きません。/fw-panel で再表示。',
  }),
  failed: L4({
    en: 'flightwake panel: this surface could not open a pane.',
    'zh-TW': 'flightwake 面板:這個介面無法開啟面板。',
    'zh-CN': 'flightwake 面板:这个界面无法打开面板。',
    ja: 'flightwake パネル:この画面ではパネルを開けません。',
  }),
  inProgress: L4({ en: 'In progress', 'zh-TW': '進行中', 'zh-CN': '进行中', ja: '進行中' }),
  next: L4({ en: 'Next', 'zh-TW': '下一步', 'zh-CN': '下一步', ja: '次の入口' }),
  session: L4({ en: 'This session', 'zh-TW': '本 session', 'zh-CN': '本 session', ja: 'このセッション' }),
  others: L4({ en: 'Other sessions', 'zh-TW': '其他 session', 'zh-CN': '其他 session', ja: '他のセッション' }),
  more: L4<(n: number) => string>({ en: (n) => `+${n} more`, 'zh-TW': (n) => `另有 ${n} 條`, 'zh-CN': (n) => `另有 ${n} 条`, ja: (n) => `他 ${n} 件` }),
  none: L4({ en: 'none', 'zh-TW': '無', 'zh-CN': '无', ja: 'なし' }),
  updated: L4<(d: string) => string>({ en: (d) => `STATE updated ${d}`, 'zh-TW': (d) => `STATE 更新於 ${d}`, 'zh-CN': (d) => `STATE 更新于 ${d}`, ja: (d) => `STATE 更新 ${d}` }),
  uninitialized: L4({
    en: 'STATE not initialized yet — run /fw-coldstart',
    'zh-TW': 'STATE 尚未初始化——先跑 /fw-coldstart',
    'zh-CN': 'STATE 尚未初始化——先跑 /fw-coldstart',
    ja: 'STATE が未初期化——まず /fw-coldstart',
  }),
  counts: L4<(a: { files: number; shell: number; tests: number; pass: number; fail: number; commits: number }) => string>({
    en: (a) => `${a.files} file(s) · ${a.shell} via shell · ${a.tests} test run(s)${a.tests ? ` (✓${a.pass} ✗${a.fail})` : ''} · ${a.commits} commit(s)`,
    'zh-TW': (a) => `改檔 ${a.files} · shell ${a.shell} · 測試 ${a.tests}${a.tests ? `(✓${a.pass} ✗${a.fail})` : ''} · commit ${a.commits}`,
    'zh-CN': (a) => `改文件 ${a.files} · shell ${a.shell} · 测试 ${a.tests}${a.tests ? `(✓${a.pass} ✗${a.fail})` : ''} · commit ${a.commits}`,
    ja: (a) => `ファイル ${a.files} · シェル ${a.shell} · テスト ${a.tests}${a.tests ? `(✓${a.pass} ✗${a.fail})` : ''} · commit ${a.commits}`,
  }),
  recorderOff: L4({ en: 'session flight log is off', 'zh-TW': 'session 行車記錄已關閉', 'zh-CN': 'session 行车记录已关闭', ja: 'セッション記録はオフ' }),
  spendNone: L4({ en: 'tokens and cost: not measured yet', 'zh-TW': 'token 與費用:尚未量到', 'zh-CN': 'token 与费用:尚未量到', ja: 'トークンとコスト:未計測' }),
  fleetOff: L4({ en: 'session fleet is off', 'zh-TW': 'session 狀態回報已關閉', 'zh-CN': 'session 状态上报已关闭', ja: 'セッション報告はオフ' }),
  fleetWaiting: L4({ en: 'first heartbeat pending (30 s)', 'zh-TW': '等第一次心跳(30 秒)', 'zh-CN': '等第一次心跳(30 秒)', ja: '最初のハートビート待ち(30 秒)' }),
  fleetNotReporting: L4({ en: 'not reporting in this session — /fw-mod says why', 'zh-TW': '本 session 沒有回報——/fw-mod 有原因', 'zh-CN': '本 session 没有上报——/fw-mod 有原因', ja: 'このセッションは報告していない——理由は /fw-mod' }),
  context: L4<(p: number) => string>({ en: (p) => `context ${p}%`, 'zh-TW': (p) => `context ${p}%`, 'zh-CN': (p) => `context ${p}%`, ja: (p) => `context ${p}%` }),
}
