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

The current published npm release is 0.18.0 (2026-11-10). It adds Antigravity support (verified on agy CLI 1.5.3), \`traps similar\` (duplicate check before a new trap is written), \`traps stats\` and \`traps forget\`. The optional Claude Code mod 0.4.0 hints about a trap only when an edit or a command targets an anchored path or command; the hint arrives with the tool result, not before the tool runs. Fleet, the side panel, spend and roles are in maintenance mode. Simplified Chinese and Japanese docs stay at v0.17.0. Consult the repository and npm for the current release status.
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
