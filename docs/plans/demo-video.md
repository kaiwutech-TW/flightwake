# 示範影片腳本(B2)

- 狀態(2026-11-11):**旁白已錄、已剪;粗剪 v0 完成(字卡代替畫面)**。下一步:定角色(Google Flow 專案「flightwake 宣傳片」,Q 版小飛行員)→ hook 四格首尾幀 → 實錄 S1–S6 → 換掉字卡。
- 檔案都在 Kai 的桌面 `~/Desktop/計畫案/`,不進 repo:`剪好的旁白/en|zh/01–11.wav`(每句一檔)、`影片製作/旁白剪輯點.tsv`(每句取自哪個錄音檔的哪一段)、
  `影片製作/build_v0.py`(重建粗剪)、`影片製作/粗剪/flightwake-demo-v0-{en,zh}.mp4` 與 `.srt`。英文約 89 秒、中文約 57 秒。
- 選段規則:Kai 念錯會拍手。拍手用「短促、高頻比例高、落在停頓裡」辨認(「repo」的爆破音會被單純的音量偵測誤判);每句取拍手之後最後一次完整的唸法,並逐檔轉文字確認沒有切到字、沒混進念錯的部分。
- 長度目標:約 65 秒。前 10 秒只講痛點和一句解法,之後才一個一個講功能。
- 每一句宣稱都對得上 0.18.0 已發佈的行為。不能說「改之前先提醒」:絆線的提示是**工具跑完之後**才出現(DECISIONS 2026-11-10)。
- 旁白念英文版。中文欄只是對照,方便你知道每句在講什麼;中文場合可以改念「中文版旁白」。

## 錄音提示

- 一句一個檔(`01.wav`、`02.wav`…),句子之間留 1 秒空白,剪接時好對畫面。
- 語速放慢沒關係,畫面會配合你的長度;唸錯就整句重唸。
- 粗體字是重音。

## 英文旁白

| # | 時間 | 英文旁白(照念) | 中文對照 | 畫面 |
|---|---|---|---|---|
| 01 | 0:00–0:03 | Your AI agent **forgets** everything between sessions. | 你的 AI agent 每個新 session 都忘光。 | H1 |
| 02 | 0:03–0:06 | It hits the **same trap** twice. | 同一個坑踩兩次。 | H2 |
| 03 | 0:06–0:08 | Switch to Codex, and you **start over**. | 換成 Codex,又要從頭講。 | H3 |
| 04 | 0:08–0:11 | flightwake keeps the **story** in your repo. | flightwake 把來龍去脈留在 repo 裡。 | H4 |
| 05 | 0:11–0:18 | One command: npx flightwake setup. It asks a few questions, and shows **every file** it will write. | 一行指令。問你幾個問題,先列出它會寫的每一個檔。 | S1 |
| 06 | 0:18–0:28 | Next day, a fresh session runs **coldstart**. In about **twenty-five seconds**, it knows where you left off, what is not verified yet, and what comes next. | 隔天開新 session 跑 coldstart,大約 25 秒就知道上次做到哪、哪些還沒驗證、下一步是什麼。 | S2 |
| 07 | 0:28–0:35 | When you make a call that rules out other options, it is **one line** in DECISIONS, with the reason. | 做了排除其他選項的決定,就在 DECISIONS 寫一行,附上理由。 | S3 |
| 08 | 0:35–0:45 | When something **surprising** bites you, the agent writes it down: the cause, and the way around it. The next agent that heads for that spot **stops** and checks first. | 踩到意想不到的坑,agent 會記下原因和繞法。下一個要碰那裡的 agent,會先停下來確認。 | S4 |
| 09 | 0:45–0:52 | At the end, it writes a flight record with the **test results**. Forget to do it, and a hook **reminds** the agent. | 收尾時寫一份飛行紀錄,附上測試結果。忘了寫,hook 會提醒 agent。 | S5 |
| 10 | 0:52–0:59 | Claude Code, Codex and Antigravity read the **same files**. Plain Markdown in git. No server, no account. | Claude Code、Codex、Antigravity 讀同一份檔。git 裡的純 Markdown,不用伺服器、不用帳號。 | S6 |
| 11 | 0:59–1:05 | flightwake. Hand off the repo, **not the guesswork**. | flightwake:交接 repo,不必從頭講一遍。 | E1 |

念法提示:`npx` 念 "N-P-X";`coldstart` 念 "cold start";`DECISIONS` 照英文念。

## 中文版旁白(中文場合用,約 60 秒)

| # | 旁白 | 畫面 |
|---|---|---|
| 01 | 你的 AI agent,每開一個新 session 就忘光。 | H1 |
| 02 | 同一個坑,踩了兩次。 | H2 |
| 03 | 換成 Codex,又要從頭講一遍。 | H3 |
| 04 | flightwake 把來龍去脈留在 repo 裡。 | H4 |
| 05 | 一行指令裝好。它會問幾個問題,先列出要寫的每一個檔。 | S1 |
| 06 | 隔天開新的 session,跑 coldstart,大約二十五秒,就知道上次做到哪、哪些還沒驗證、下一步做什麼。 | S2 |
| 07 | 做了排除其他選項的決定,在 DECISIONS 寫一行,附上理由。 | S3 |
| 08 | 踩到意想不到的坑,agent 會記下原因和繞法。下一個要碰那裡的 agent,會先停下來確認。 | S4 |
| 09 | 收尾時寫一份飛行紀錄,附上測試結果;忘了寫,hook 會提醒。 | S5 |
| 10 | Claude Code、Codex、Antigravity 讀的是同一份檔案。git 裡的 Markdown,不用伺服器,不用帳號。 | S6 |
| 11 | flightwake:交接 repo,不必從頭講一遍。 | E1 |

## 畫面清單(實作者之後抓)

前 10 秒(H1–H4)節奏要快,每個畫面 2–3 秒,畫面上疊一行大字。

| 代號 | 內容 | 怎麼抓 | 疊字 |
|---|---|---|---|
| H1 | 新的 Claude Code session,使用者問「我們昨天做到哪?」,agent 回「我沒有之前的紀錄」 | 沒裝 flightwake 的暫存 repo,真的問一次 | Forgets everything |
| H2 | 同一個錯誤訊息出現第二次 | 用 TRAPS 裡真實的一條重現,例如 `smoke-needs-python-311`(系統 python3 跑 smoke 的錯誤) | Same trap, twice |
| H3 | 從 Claude Code 分頁切到 Codex 分頁,Codex 問「這個專案是做什麼的?」 | Orca 兩個分頁 | Start over |
| H4 | `.flightwake/` 的四個檔案亮起來:STATE、records、DECISIONS、TRAPS | 編輯器檔案樹 | The story stays in the repo |
| S1 | `npx flightwake setup --lang=en` 在乾淨的暫存 repo,走到「確認前列出寫入路徑」那一步 | 暫存 repo 實錄(取代現在的繁中 `docs/demo.gif`) | `npx flightwake setup` |
| S2 | 本 repo 的乾淨 clone 跑 `/fw-coldstart`,回報出現 | 照 `README.md` 量測條件(約 25 秒,可快轉並標 2×) | ~25 s, measured |
| S3 | `DECISIONS.md` 一行(例:2026-11-10 A5 不承諾執行前提示) | 編輯器捲動到該行 | One line, with the why |
| S4 | 請 Claude Code 做一個會踩坑的改動,它停下來、引用 TRAPS 那條坑、給安全做法(提示本身畫面上看不到,見 `demo-video-recording.md`) | 示範 repo 實錄 | Stops and checks first |
| S5 | STATE 落後 3 個 commit 時,Stop hook 提醒收尾,agent 接著跑 `/fw-record` | 本 repo 或暫存 repo | Reminded to wrap up |
| S6 | Orca 三個分頁(Claude Code、Codex、agy)各自跑 coldstart,讀到同一份 STATE | Orca 實錄 | Same files, every agent |
| E1 | 網站首屏或黑底大字 + `npx flightwake setup` + 網址 | 靜態畫面 | flightwake.kaiwu.com.tw |

## 錄好之後

- 英文版做成 README 第一屏的示範(取代 `docs/demo.gif` 的繁中安裝畫面),另存一份有聲 MP4 給網站和社群用。
- 畫面裡不能出現私人資訊(帳號、email、家目錄路徑、客戶 repo 名稱、費用);錄完逐格檢查一次。

## Hook 四格分鏡(插畫,Google Flow;待 Kai 確認後才畫)

角色:Q 版小飛行員(Flow 專案「flightwake 宣傳片」的設定圖,背後硬殼橘色記錄器、一顆綠燈)。配色:暖橘 #ED693E、米白 #F6F2E9、深炭灰 #252821,少量鼠尾草綠。
原則(照參考文章):每格只做一兩個動作;人物不說話;畫面裡不放任何文字(字卡與字幕後製用程式疊上);臉放在畫面左起約 38% 或 62%;每格換機位。
秒數照縮短停頓後的英文旁白(中文版再對齊)。

| 格 | 旁白 | 秒 | 機位 | 首幀 | 尾幀 | 這格什麼在動 |
|---|---|---|---|---|---|---|
| H1 | Your AI agent forgets everything between sessions. | 0–3.5 | 平視中景,慢推近 | 小飛行員坐在小駕駛艙式的書桌前,身後軟木板貼滿便利貼和箭頭,他看著筆電微笑 | 軟木板變成一片空白,便利貼化成小光點消失,他歪頭、手指抵著臉頰,一臉困惑 | 便利貼淡出(畫面左側)、鏡頭推近 |
| H2 | It hits the same trap twice. | 3.5–5.9 | 低角度側拍,固定 | 他從畫面左邊走向右邊,臉頰已經貼著一塊 OK 繃,前方地板有一個打開的小地洞 | 他掉進同一個地洞,只剩帽子和護目鏡露在洞口,冒出一小團灰 | 人由左往右走、掉落(一個動作) |
| H3 | Switch to Codex, and you start over. | 5.9–8.6 | 過肩拍 | 小飛行員把操縱桿交給另一位穿青綠色夾克的小飛行員(代表另一個 agent),儀表板上的指示燈都亮著 | 青綠色那位看著全暗的儀表板,頭上冒一個只有問號的思考泡泡 | 交接動作、儀表燈熄滅 |
| H4 | flightwake keeps the story in your repo. | 8.6–11.9 | 正面中景,慢拉遠 | 小飛行員轉身打開背上的橘色記錄器,綠燈亮起 | 四張小卡(指南針、一疊紙、天平、警示三角形)從記錄器飛回軟木板,他比讚 | 卡片由右往左飛、鏡頭拉遠 |

- 四張小卡對應 STATE、records、DECISIONS、TRAPS;名稱用後製字卡疊上,不讓模型畫字。
- 生成順序照文章:先畫尾幀(內容最多),再由尾幀改出首幀;四格的首尾幀畫完先給另一個 agent 審,再算 Flow 點數報價,Kai 同意才生成影片。
- 計價(2026-11-11 實測):Omni 1.2 Flash 720p 每秒 3 點,長度 3–8 秒可調;出圖與改圖 0 點。四格照旁白取 4/3/3/4 秒,共 42 點。
- 審查(`demo-video.review-claude-subagent.md`)後:H2 尾幀改成面向右、只露帽子與護目鏡、一小團灰(Flow「Editing pilot falling into hatch」);
  H4 首幀改成板上已有便利貼、空出四張卡的位置(「Edit corkboard on image」),尾幀便利貼對齊首幀、補回記錄器上蓋、拿掉速度線、閉嘴笑(「Editing pilot image details」)。
  首尾幀構圖相同,所以提示詞都寫固定鏡頭,推近/拉遠留給後製數位縮放。
- 進度:H1–H4 v1 都已生成(4/3/3/4 秒,共 42 點),檔案在 `影片製作/hook影片/H{1..4}-v1.mp4`(自帶音效軌,剪輯時換成旁白),
  逐格檢查(每秒 3 格):角色、硬殼記錄器、綠燈都沒漂,畫面裡沒有文字。小瑕疵:
  H2 掉進洞時轉向鏡頭、舉手咧嘴笑(像故意跳進去);H4 有兩張卡飛過臉前約半秒,中段一度疊在一起才歸位。
  Kai 要求重生兩支(21 點,累計 63 點):H2 v2 全程側面朝右、沒發現洞就掉下去,只在下墜瞬間手微抬,採用;
  H4 v2 卡片一張一張貼、不再疊在一起,但仍有卡片飛過臉前約 0.25 秒(提示詞寫明走畫面上緣也擋不住,路徑本來就經過頭部)。
  目前組合 H1-v1、H2-v2、H3-v1、H4-v2,串接無聲預覽 `hook-串接預覽.mp4`。H4 生成 4 秒、旁白 3.3 秒,剪輯時再決定裁頭或裁尾(比讚約從 3.0 秒開始)。
- 實錄:S1–S6 都用 vhs 錄好(`影片製作/實錄/`,1920×1080),做法與每段的取捨見 `demo-video-recording.md`。
- 粗剪 v2(`影片製作/build_v2.py` → `粗剪/flightwake-demo-v2-{en,zh}.mp4`,65.3 / 51.4 秒):S1–S6 換成實錄跳剪,S6 右上角標 agent 名稱;E1 仍是字卡。
- 粗剪 v3(`影片製作/build_v3.py` + `影片製作/remotion/`,Remotion 4.0.542 → `粗剪/flightwake-demo-v3-{en,zh}.mp4`):
  實錄段落加鏡頭推近、重點框(框外壓暗)、左下小標(S1 在右下);E1 換成 Flow 生成的交接動畫(`hook影片/E1-v1.mp4`,5 秒 15 點,累計 78 點):
  橘衣把記錄器交給青綠衣、打開後儀表板亮起、比讚,3.3 秒起背景糊掉、浮出網站同款 logo、標語、`npx flightwake setup`、網址。
  配樂:Flow Music 生成兩版(`配樂/theme-a.wav` 68 秒、開頭輕、淡出收尾;`theme-b.wav` 72 秒、整體大聲約 3 dB),先用 A;
  壓在旁白下(-12 dB + sidechain),中文版較短,接上曲子最後 8 秒保住收尾。Kai 2026-11-11:配樂用 A;中文 hook 字卡、小標、片尾標語都 OK。
- 直式版(`影片製作/build_v4.py`,Remotion `Vertical` → `粗剪/flightwake-demo-vertical-{en,zh}.mp4`,1080×1920):
  頂部 logo → 標題(hook 字卡 / 段落小標)→ 中間 1080×1080 → 底部旁白字幕(依標點切段、照字數比例對時)。
  hook 用不帶字卡的乾淨版整幅置中、底下同畫面模糊;S1–S5 把終端機左半欄(約 1180 px 寬)塞進方框,重點框同橫式;S6、E1 整幅置中,E1 換直式片尾卡。
  字幕照旁白稿;中文 06「下一步要做什麼」、08「留下」照實際念法(兩次語音辨識一致)。
- **旁白第 8 句已改、已補錄**(Kai 2026-11-11 選 S4 拍「agent 停下來引用坑」):原句說「改完馬上看到警告」,但提示是給 agent 的、畫面上看不到。
  新句見上面兩張表。補錄檔 `Audio Files/音訊 1 #05.wav`(英文取 7.43–14.47 + 24.70–29.85 秒,後半句前幾次卡住;中文取 33.99–41.84 秒),
  剪輯點已寫進 `旁白剪輯點.tsv`;舊的 08 備份在 `剪好的旁白_舊08_備份/`。
- 粗剪 v1(`影片製作/build_v1.py` → `粗剪/flightwake-demo-v1-{en,zh}.mp4`,66.9 / 51.0 秒):hook 換成插畫影片,其餘沿用 v0 字卡。
  每格最多加速 1.15 倍、還太長就裁開頭(保住結尾動作);2x lanczos 後數位推近(H1)/拉遠(H4)8%,輕微銳化;底部疊一行大字(中文字卡文字是草稿)。

## 交付兩個版本(Kai 2026-11-11)

| 版本 | 用途 | 比例 | 插畫 hook(H1–H4) | 實錄段落(S1–S6) | 字幕 |
|---|---|---|---|---|---|
| 橫式 | 網站、README | 16:9,1920×1080 | 16:9 首尾幀 | 原尺寸終端機畫面 | 下方一行 |
| 直式 | 短影片(Shorts、Reels、TikTok) | 9:16,1080×1920 | **沿用橫式影片**:整幅置中(寬 1080),上下以同一畫面放大模糊、壓暗當底;上方放標題、下方放字幕 | 放大終端機的重點區域,上下留字幕與標題 | 畫面中段偏下、字級加大 |

- 中英文各兩個版本,共四支。旁白同一份(`剪好的旁白_緊湊/`)。
- 定案:角色用「硬殼記錄器」修改版的右邊那張(Kai 2026-11-11 OK);hook 分鏡照上一節。畫風照現在的咖啡金屬色調(Kai 2026-11-11)。
- 直式不另外生成(Kai 2026-11-11,原因見 DECISIONS 同日):直接裁成 9:16 時,720p 只剩 405×720 寬、要放大 2.7 倍,而且 H2 走位、H3 交接、H1/H4 橫向動作都會出框;
  另生一套要再畫八張首尾幀、再生四支(約 42 點,見下方計價),角色也要再對一次。濾鏡:`[0]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30,eq=brightness=-0.15[bg];[b]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=0:(H-h)/2`。
- 解析度(Kai 2026-11-11):Flow 影片用 720p、每次 1 個輸出;本機放大:ffmpeg `scale=…:flags=lanczos` 加輕微銳化(橫式到 1920×1080、直式到 1080×1920),
  不夠清楚再試本機 AI 放大(Real-ESRGAN 動畫模型);不做整段補幀。每格的生成秒數照旁白長度向上取整、多留約 0.5 秒。
