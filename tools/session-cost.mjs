#!/usr/bin/env node
/**
 * flightwake dev 工具 — 零 token 的 session 成本量測。
 * 解析 Claude Code 本機 transcript(~/.claude/projects/<專案>/<session>.jsonl,
 * 每條 assistant 訊息帶原始 API usage),純檔案讀取、不經過模型、不花 token。
 *
 * 注意:transcript 路徑與格式是 Claude Code 內部實作,無穩定承諾——本工具僅供
 * 框架開發量測(docs/benchmarks.md),不隨 init 安裝、不是框架承諾的一部分;
 * 失效時退回向使用者要 /cost。
 *
 * 用法:node tools/session-cost.mjs [transcript.jsonl] [--since=2026-07-18T06:54]
 *   無參數:取目前 cwd 對應專案目錄中最新的 transcript
 *   --since:只算該 ISO 時間(前綴比對)之後的訊息——切出單一冷啟動 turn 用
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith('--'));
const since = args.find((a) => a.startsWith('--since='))?.slice('--since='.length);

let file = fileArg;
if (!file) {
  const projDir = join(homedir(), '.claude', 'projects', process.cwd().replace(/[/.]/g, '-'));
  const jsonls = (() => { try { return readdirSync(projDir); } catch { return []; } })()
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => join(projDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!jsonls.length) { console.error(`找不到 transcript:${projDir}`); process.exit(1); }
  file = jsonls[0];
}

// 以 message.id/requestId 去重、留最後一筆:串流會為同一則訊息寫多行,usage 以最終值為準
const byId = new Map();
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let j; try { j = JSON.parse(line); } catch { continue; }
  const u = j.message?.usage;
  if (!u) continue;
  if (since && (!j.timestamp || j.timestamp < since)) continue;
  byId.set(j.message.id ?? j.requestId ?? j.uuid, { u, model: j.message.model ?? '?' });
}

const models = {};
for (const { u, model } of byId.values()) {
  const m = (models[model] ??= { msgs: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 });
  m.msgs++;
  m.input += u.input_tokens ?? 0;
  m.output += u.output_tokens ?? 0;
  m.cache_read += u.cache_read_input_tokens ?? 0;
  m.cache_write += u.cache_creation_input_tokens ?? 0;
}
console.log(JSON.stringify({ transcript: file, since: since ?? null, models }, null, 2));
