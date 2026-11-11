import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const site = import.meta.env.SITE || 'https://flightwake.kaiwu.com.tw';
  const url = (path: string) => new URL(path, site).toString();
  const body = `# flightwake

> Hand this repo to another person or another agent, and they can see how it was built: what was done, why each choice was made, and which traps were found.

- English: ${url('/')}
- 繁體中文: ${url('/zh-TW/')}
- 简体中文: ${url('/zh-CN/')}
- 日本語: ${url('/ja/')}
- Source and README: https://github.com/kaiwutech-TW/flightwake
- Installation details: https://github.com/kaiwutech-TW/flightwake/blob/main/docs/install.md
- Evidence (this repo's own records, decisions and traps): https://github.com/kaiwutech-TW/flightwake/blob/main/docs/evidence.md
- Multi-agent workflow: https://github.com/kaiwutech-TW/flightwake/blob/main/docs/multi-agent.md

Install with \`npx flightwake setup\` inside a git repository (Node.js 18+). flightwake keeps STATE, DECISIONS, TRAPS and records as Markdown in git. Claude Code, Codex and Antigravity (agy) each get the four skills (fw-coldstart, fw-record, fw-trap, fw-handoff) and a Stop hook that reminds the agent to wrap up when STATE falls behind the commits. Gemini CLI remains supported for enterprise and API-key users.

The current published npm release is 0.19.0 (2026-11-11). Every install gets a trap check for Claude Code and Codex (no mod needed): when a tool call edits a file or runs a command anchored in TRAPS, the entry's root cause and workaround arrive with the tool result, for the next step; it never blocks. For Antigravity, \`npx flightwake traps rules\` turns anchored entries into \`.agents/rules/\` files (model_decision) that agy reads before editing a matching file. Claude Code can also install flightwake as a plugin: \`/plugin install flightwake --marketplace kaiwutech-TW/flightwake\`. Antigravity support arrived in 0.18.0 (verified on agy CLI 1.5.3). Fleet, the side panel, spend and roles are in maintenance mode. Simplified Chinese and Japanese docs stay at v0.17.0. Consult the repository and npm for the current release status.
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
