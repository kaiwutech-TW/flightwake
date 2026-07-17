# Security Policy

## 回報漏洞

請透過 GitHub 的 **Private Vulnerability Reporting**(repo 的 Security 分頁 → Report a vulnerability)回報,
不要開公開 issue。我們目標在 7 天內回應。

## 支援版本

只有最新發布版本收安全修補。

## 威脅模型(給評估者的快速事實)

flightwake 是純檔案複製的安裝器 + 一個本地 git 查詢 hook,攻擊面刻意極小:

- **零 runtime 依賴**:`package.json` 無任何 dependencies;沒有 install scripts(無 postinstall)。
- **無網路存取**:安裝器與 hook 都不發任何網路請求。
- **寫入範圍固定**:`init` 只寫目標 repo 的 `.flightwake/`、`.claude/skills/fw-*`、
  `.claude/settings.json`(併入一條 Stop hook)與 CLAUDE.md(附加標記片段)。不碰其他路徑、不執行 shell。
- **hook 執行的是 repo 內的檔案**:`.flightwake/hooks/state-check.mjs` 進 git,
  能 commit 的人就能改它——這與任何 repo-local hook/設定相同,Claude Code 會在載入 repo 設定時要求使用者確認。
  hook 本身只用 `execFileSync('git', …)`(無 shell)做唯讀查詢,任何錯誤靜默放行。
- **發布完整性**(開源後):透過 npm Trusted Publishing 發布並附 provenance attestation;
  使用者可用 `npm audit signatures` 驗證。
