/**
 * F6 spend — what this session has used: tokens (summed from the session's transcript, one count per API response)
 * and the API-equivalent cost in US dollars (the engine's own ledger, the figure /cost and the status line total;
 * on a subscription it is what the same traffic would have cost on the API, not a bill).
 * Refreshed on session.start and on every session.measure (the engine pushes it after each main-thread turn);
 * the band and /fw-mod only read the stored FwSpend, and `/fw-cost` prints the breakdown. Reads only; never writes.
 */
import { atom, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import { fwContext, M } from '../lib/core'
import type { Io, Lang } from '../lib/core'
import { emptyTotals, fmtTokens, fmtUsd, sumTranscriptUsage, totalTokens, transcriptPath } from '../lib/spend'
import type { TokenTotals } from '../lib/spend'
import type { FwSpend } from '../../types/index'

const spendRef = atom({ plugin: 'flightwake-mod', key: 'spend' } as const, null)

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

/** The launch directory, which keys the transcript folder (session.start's `cwd`; the op as a fallback). */
let launchCwd: string | null = null

async function readTotals($: EngineInterface, io: Io): Promise<TokenTotals | null> {
  try {
    let home: string | undefined
    try { home = await $.env.get('HOME') } catch { home = undefined }
    if (!home) { try { home = await $.env.get('USERPROFILE') } catch { home = undefined } }
    const cwd = launchCwd ?? (await (async () => { try { return await $.session.cwd() } catch { return '' } })())
    const p = transcriptPath(home ?? '', cwd, await io.sessionId())
    if (p === null) return null
    const text = await io.read(p)
    return text === null ? null : sumTranscriptUsage(text)
  } catch {
    return null
  }
}

/** Recompute and store; usd from the figures the engine handed us (a measure event) or from the op. Never throws. */
async function refresh($: EngineInterface, usdHint?: number | null): Promise<void> {
  try {
    const io = ioOf($)
    if ((await fwContext(io)) === null) return
    let usd: number | null = typeof usdHint === 'number' && Number.isFinite(usdHint) ? usdHint : null
    let model: string | null = null
    if (usd === null) {
      try {
        const u = await $.session.usage()
        usd = typeof u.cost?.usd === 'number' && Number.isFinite(u.cost.usd) ? u.cost.usd : null
      } catch { usd = null }
    }
    try { model = await $.session.model() } catch { model = null }
    const totals = await readTotals($, io)
    const next: FwSpend = { sessionId: await io.sessionId(), usd, tokens: totals, model, at: Date.now() }
    await update($, spendRef, () => next)
  } catch {}
}

function costText(lang: Lang, s: FwSpend): string {
  const t = s.tokens ?? emptyTotals()
  const out: string[] = []
  out.push(`## /fw-cost`, '')
  out.push(M(lang, {
    en: `**API-equivalent cost this session: ${s.usd === null ? 'unknown (the host keeps no cost ledger)' : `≈ ${fmtUsd(s.usd)}`}**${s.model ? ` · model ${s.model}` : ''}`,
    'zh-TW': `**本 session 的 API 等值費用:${s.usd === null ? '不明(這個環境沒有費用帳)' : `≈ ${fmtUsd(s.usd)}`}**${s.model ? ` · 模型 ${s.model}` : ''}`,
    'zh-CN': `**本 session 的 API 等值费用:${s.usd === null ? '不明(这个环境没有费用账)' : `≈ ${fmtUsd(s.usd)}`}**${s.model ? ` · 模型 ${s.model}` : ''}`,
    ja: `**このセッションの API 換算コスト:${s.usd === null ? '不明(この環境にはコスト台帳がない)' : `≈ ${fmtUsd(s.usd)}`}**${s.model ? ` · モデル ${s.model}` : ''}`,
  }), '')
  if (s.tokens === null) {
    out.push(M(lang, {
      en: 'Tokens: unknown — the session transcript could not be read (expected under ~/.claude/projects/).',
      'zh-TW': 'Token:不明——讀不到 session transcript(預期在 ~/.claude/projects/ 下)。',
      'zh-CN': 'Token:不明——读不到 session transcript(预期在 ~/.claude/projects/ 下)。',
      ja: 'トークン:不明——セッションの transcript が読めない(~/.claude/projects/ 配下のはず)。',
    }))
  } else {
    const head = M(lang, { en: '| tokens | count |', 'zh-TW': '| token | 數量 |', 'zh-CN': '| token | 数量 |', ja: '| トークン | 数 |' })
    out.push(head, '|---|---:|')
    const row = (label: Record<Lang, string>, n: number) => out.push(`| ${M(lang, label)} | ${n.toLocaleString('en-US')} |`)
    row({ en: 'input (uncached)', 'zh-TW': '輸入(未快取)', 'zh-CN': '输入(未缓存)', ja: '入力(キャッシュ外)' }, t.input)
    row({ en: 'cache write', 'zh-TW': '寫入快取', 'zh-CN': '写入缓存', ja: 'キャッシュ書き込み' }, t.cacheWrite)
    row({ en: 'cache read', 'zh-TW': '讀取快取', 'zh-CN': '读取缓存', ja: 'キャッシュ読み取り' }, t.cacheRead)
    row({ en: 'output', 'zh-TW': '輸出', 'zh-CN': '输出', ja: '出力' }, t.output)
    row({ en: '**total**', 'zh-TW': '**合計**', 'zh-CN': '**合计**', ja: '**合計**' }, totalTokens(t))
    out.push('', M(lang, {
      en: `${t.responses} API response(s) counted from the main transcript; subagents run in their own transcripts and are not included here (their cost is in the dollar figure).`,
      'zh-TW': `從主 transcript 數到 ${t.responses} 次 API 回應;子 agent 有自己的 transcript,token 不計在這裡(費用已含在金額裡)。`,
      'zh-CN': `从主 transcript 数到 ${t.responses} 次 API 响应;子 agent 有自己的 transcript,token 不计在这里(费用已含在金额里)。`,
      ja: `メイン transcript から ${t.responses} 件の API 応答を集計。サブエージェントは別 transcript のためここには含まない(金額には含まれる)。`,
    }))
  }
  out.push('', M(lang, {
    en: 'The dollar figure is Claude Code\'s own ledger (what /cost shows) at API list prices; on a subscription it is not a bill. Read-only: /fw-cost changes nothing.',
    'zh-TW': '金額是 Claude Code 自己的帳(與 /cost 相同),按 API 牌價計;訂閱用戶不會另外被收這筆。唯讀:/fw-cost 不改任何東西。',
    'zh-CN': '金额是 Claude Code 自己的账(与 /cost 相同),按 API 牌价计;订阅用户不会另外被收这笔。只读:/fw-cost 不改任何东西。',
    ja: '金額は Claude Code 自身の台帳(/cost と同じ)で API 定価換算。サブスクリプションでは請求ではない。読み取り専用:/fw-cost は何も変更しない。',
  }))
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
      name: 'fw-cost',
      description: M(ctx.lang, {
        en: 'Tokens used this session and the API-equivalent cost (read-only)',
        'zh-TW': '本 session 用了多少 token、API 等值多少錢(唯讀)',
        'zh-CN': '本 session 用了多少 token、API 等值多少钱(只读)',
        ja: 'このセッションのトークン使用量と API 換算コスト(読み取り専用)',
      }),
    })
  } catch {
    isCommandRegistered = false
  }
}

/** One line for the band: "1.2M tok · ≈$4.99"; '' when nothing is known. */
export function spendLine(s: FwSpend | null): string {
  if (!s) return ''
  const parts: string[] = []
  if (s.tokens !== null) parts.push(`${fmtTokens(totalTokens(s.tokens))} tok`)
  if (s.usd !== null) parts.push(`≈${fmtUsd(s.usd)}`)
  return parts.join(' · ')
}

export function registerSpend(on: On): void {
  on('session.start', {}, async ($, e, next) => {
    launchCwd = e.cwd
    const r = await next(e)
    await ensureCommand($)
    await refresh($)
    return r
  })

  on('session.measure', {}, async ($, e, next) => {
    const r = await next(e)
    await refresh($, typeof e.cost?.usd === 'number' ? e.cost.usd : null)
    return r
  })

  on('command.run', { command: 'fw-cost' }, async ($, e, next) => {
    try {
      const io = ioOf($)
      const ctx = await fwContext(io)
      if (ctx === null) return next(e)
      await refresh($)
      const cur = (await $.state.get({ plugin: 'flightwake-mod', key: 'spend' })).value ?? null
      const s = cur !== null && cur.sessionId === (await io.sessionId()) ? cur : null
      return { text: costText(ctx.lang, s ?? { sessionId: '', usd: null, tokens: null, model: null, at: 0 }) }
    } catch {
      return next(e)
    }
  })
}
