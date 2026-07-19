# Security Policy

## Reporting a vulnerability

Please report vulnerabilities through GitHub's **Private Vulnerability Reporting**:
<https://github.com/kaiwutech-TW/flightwake/security/advisories/new> (repo → Security tab → Report a vulnerability).
Do **not** open a public issue for security reports.

- **Acknowledgement**: within 7 days
- **Fix or mitigation plan**: within 30 days for confirmed issues; coordinated disclosure after the fix ships

## Supported versions

Only the latest released version receives security patches.

## Threat model (quick facts for reviewers)

flightwake is a pure file-copying installer plus local git-query hooks; the attack surface is deliberately tiny:

- **Zero runtime dependencies**: `package.json` has no dependencies and no install scripts (no postinstall).
- **Network access**: the installer and hooks make no network requests, with one opt-out exception —
  the statusline's update check performs an anonymous `GET https://registry.npmjs.org/flightwake/latest`
  at most once per 24h in a detached background process (cache in the OS temp dir; disable with `FLIGHTWAKE_NO_UPDATE_CHECK=1`).
- **Fixed write scope**: `init` writes only the target repo's `.flightwake/`, `.claude/skills/fw-*`,
  `.claude/settings.json` (merging in one Stop hook), and the instruction file (appending a marked snippet).
  No other paths, no shell execution.
- **Hooks execute files inside the repo**: `.flightwake/hooks/*.mjs` are committed to git —
  anyone who can commit can change them, same as any repo-local hook/config; Claude Code asks the user
  to confirm when loading repo settings. The hooks use `execFileSync('git', …)` (no shell) for read-only
  queries and degrade silently on any error.
- **Release integrity**: published via npm Trusted Publishing with provenance attestation;
  verify with `npm audit signatures`.

---

## 回報漏洞(繁體中文)

請透過 GitHub 的 **Private Vulnerability Reporting** 回報(連結見上),不要開公開 issue。
7 天內回應;確認的問題 30 天內給出修補或緩解方案。只有最新發布版本收安全修補。
