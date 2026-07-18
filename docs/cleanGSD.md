# cleanGSD — GSD 全域安裝的完整移除手冊

> 實戰驗證:2026-07-18,GSD 1.7.0,macOS。起因:flightwake statusline 顯示開場 context 已 22%,
> 解析 transcript 發現 session 第一筆 usage 即 40,377 tokens(20.2%)——使用者還沒打一個字。
> 主因是 GSD 全域安裝的 71 個 skill + 34 個 agent 描述清單 + 7 類 hooks,每個 session 都要載入。

## 適用範圍

移除的是 **`~/.claude` user 層的全域安裝**。各 repo 的 `.planning/` 是 repo 內資料,完全不受影響
(還沒遷移的 repo 只是少了 GSD 指令可用,歷史紀錄都在)。從 GSD 遷移到 flightwake 的 repo 級步驟
見 README「從 GSD 遷移」節;本手冊是遷移後的階段二:拆全域。

## 步驟 0:盤點足跡(先看再刪)

GSD 自帶檔案 manifest(含 SHA-256),這是乾淨移除的關鍵:

```bash
node -e '
const m=require(process.env.HOME+"/.claude/gsd-file-manifest.json");
const top={};
for(const f of Object.keys(m.files)){const p=f.split("/")[0];top[p]=(top[p]||0)+1;}
console.log("GSD 登記檔案:", Object.keys(m.files).length, top);'
```

2026-07-18 實測為 591 檔:`gsd-core/` 447、`skills/` 71、`agents/` 34、`hooks/` 27、`scripts/` 12。
另有 manifest 外的狀態檔:`gsd-file-manifest.json`、`gsd-install-state.json`、`gsd-migration-journal/`,
以及 `settings.json` 內的 hooks(7 類全是 GSD)、statusLine、permissions.allow 條目。

**先確認 manifest 外沒有你自己的檔案混在同目錄**(有的話下面的清目錄步驟會自動保留它們):

```bash
node -e '
const m=require(process.env.HOME+"/.claude/gsd-file-manifest.json");
const fs=require("fs"),home=process.env.HOME+"/.claude";
const inManifest=new Set(Object.keys(m.files));
for(const d of ["hooks","scripts","skills","agents"]){
  const walk=(p)=>{for(const e of fs.readdirSync(home+"/"+p,{withFileTypes:true})){
    const rel=p+"/"+e.name;
    if(e.isDirectory())walk(rel);else if(!inManifest.has(rel))console.log("manifest 外:",rel);
  }};
  try{walk(d)}catch{}
}
console.log("(檢查完)");'
```

## 步驟 1:備份(整包可回滾)

```bash
mkdir -p ~/.claude/backups && \
cp ~/.claude/settings.json ~/.claude/backups/settings.json.pre-gsd-removal && \
tar -czf ~/.claude/backups/gsd-full-backup-$(date +%Y%m%d).tar.gz -C ~/.claude \
  gsd-core gsd-file-manifest.json gsd-install-state.json gsd-migration-journal \
  hooks scripts skills agents
```

## 步驟 2:依 manifest 精準刪檔

只刪 GSD 登記過的檔案與它的狀態檔;刪空的目錄才移除,你自己的檔案原地保留:

```bash
node -e '
const fs=require("fs"),path=require("path"),home=process.env.HOME+"/.claude";
const m=require(home+"/gsd-file-manifest.json");
for(const f of Object.keys(m.files)) fs.rmSync(path.join(home,f),{force:true});
for(const d of ["gsd-core","gsd-migration-journal"]) fs.rmSync(path.join(home,d),{recursive:true,force:true});
for(const f of ["gsd-file-manifest.json","gsd-install-state.json"]) fs.rmSync(path.join(home,f),{force:true});
const prune=(p)=>{for(const e of fs.readdirSync(p,{withFileTypes:true}))if(e.isDirectory())prune(path.join(p,e.name));
  if(!fs.readdirSync(p).length)fs.rmdirSync(p);};
for(const d of ["hooks","scripts","skills","agents"]) try{prune(path.join(home,d))}catch{}
console.log("GSD 檔案移除完成");'
```

## 步驟 3:清 settings.json

摘除 GSD 的 hooks / statusLine / permissions.allow;保留 model、theme、plugins、permissions.deny:

```bash
node -e '
const fs=require("fs"),p=process.env.HOME+"/.claude/settings.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
delete s.hooks; delete s.statusLine;
if(s.permissions?.allow){
  s.permissions.allow=s.permissions.allow.filter(x=>!/gsd|\.planning|STATE\.md/.test(x));
  if(!s.permissions.allow.length) delete s.permissions.allow;
}
fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
console.log("settings.json 已清理");'
```

> 注意:此 regex 假設 hooks/statusLine 全是 GSD 的(2026-07-18 實測如此)。若你在 user 層另有
> 自己的 hook 或 statusLine,改用手動編輯,只刪 `gsd-` 開頭的條目。

## 步驟 4:驗證

- 開新 session:`/gsd-help` 應不存在;flightwake 儀表(裝在 repo 層)照常顯示
- `ls ~/.claude`:不應再有 `gsd-core`、`gsd-*` 檔案;`skills/`、`agents/`、`hooks/` 若被刪空會整個消失
- 開場 context 底盤應明顯下降(statusline 百分比;或解析 transcript 第一筆 usage 對比)

## 還原(如果反悔)

```bash
tar -xzf ~/.claude/backups/gsd-full-backup-<日期>.tar.gz -C ~/.claude
cp ~/.claude/backups/settings.json.pre-gsd-removal ~/.claude/settings.json
```
