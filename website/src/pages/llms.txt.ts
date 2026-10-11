import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const site = import.meta.env.SITE || 'https://flightwake.kaiwu.com.tw';
  const url = (path: string) => new URL(path, site).toString();
  const body = `# flightwake

> A flight-recorder style work framework for AI coding agents. Records follow work; they do not lead it.

- 繁體中文: ${url('/')}
- 简体中文: ${url('/zh-CN/')}
- English: ${url('/en/')}
- 日本語: ${url('/ja/')}
- Source and installation: https://github.com/kaiwutech-TW/flightwake
- English documentation: https://github.com/kaiwutech-TW/flightwake/blob/main/README.md
- Multi-agent workflow: https://github.com/kaiwutech-TW/flightwake/blob/main/docs/multi-agent.md
- Real work record: https://github.com/kaiwutech-TW/flightwake/blob/main/.flightwake/records/261011-fleet-and-setup-flow.md

The current published npm release is 0.15.0. Work intended for 0.16.0 is on main but unreleased. Some Fleet runtime cases still require real-session verification. Consult the repository and npm for current release status.

flightwake keeps STATE, DECISIONS, TRAPS and records as Markdown in git. It supports Claude Code, Codex and Gemini CLI. Optional Orca integration coordinates visible agent sessions; flightwake provides their shared handoff trail.
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
