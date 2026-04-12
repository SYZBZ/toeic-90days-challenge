# TOEIC 90 Days Challenge

Serverless TOEIC 刷題 Web App（Vite + React + Firebase + Gemini），支援跨裝置同步、限時模擬考、錯題本、SRS 單字複習、PWA 離線與每日提醒。

## Tech Stack
- Frontend: Vite + React + React Router
- Auth/DB: Firebase Authentication + Firestore
- AI: `@google/generative-ai`
  - 出題：`gemini-2.5-flash`
  - 解析：`gemini-3-flash`
  - 備援：`gemini-2.5-flash`
- Deploy: GitHub Pages（GitHub Actions）
- PWA: `manifest.webmanifest` + `public/sw.js`

## Core Features
- Adaptive Difficulty Engine：目標分數 `470/730/860` 對應 `green/blue/gold`
- 模擬考：Part 5 / Part 6 / Part 7 / 綜合模式
- 題數與時間 preset：`10 題 / 5 分鐘`、`20 題 / 10 分鐘`
- 倒數計時與自動交卷
- 交卷後批次解析：題目中譯、選項中譯、正解理由、陷阱解析
- Hybrid Pool 調度採 `part + targetLevel` 雙條件過濾，避免難度混池
- 歷史考卷回顧（可回看當次完整題目與詳解）
- 歷史考卷可刪除（適合移除測試紀錄）
- 單字庫（搜尋、TSL/NGSL 篩選、收藏）
- 單字備考規劃（輸入開始日/考試日，自動分配 Day1..DayN 每日單字）
- 錯題本（獨立頁）
- SRS 單字複習（熟練定義：答對 >= 3 次）
- 進度頁（Day X/90、連續天數、SRS 已熟練）
- 每日提醒（Web Notifications）
- PWA 離線可用
- Sidebar 可折疊（桌面）

## Local Setup
1. 安裝依賴
```bash
npm install
```

2. 建立 `.env`（可從 `.env.example` 複製）
```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

3. 啟動開發
```bash
npm run dev
```

4. 建置
```bash
npm run build
npm run preview
```

## Routes
- `/dashboard`：主儀表板
- `/progress`：Day X/90、streak、SRS mastered
- `/vocabulary`：單字庫 + 收藏
- `/review`：單字 SRS 複習
- `/vocab-game`：單字小遊戲
- `/practice`：限時模擬考 + 詳解 + 歷史回顧
- `/grammar`：語法單元 + 小測
- `/mistakes`：錯題本
- `/settings`：Gemini key、模型、提醒、預設

## Firestore Schema (User Scoped)
- `users/{uid}`
  - `email`
  - `geminiApiKey`
  - `settings.level`（legacy 相容）
  - `settings.targetScore`（`470|730|860`）
  - `settings.targetLevel`（`green|blue|gold`）
  - `settings.part`
  - `settings.examPreset`
  - `settings.vocabPlan.startDate`
  - `settings.vocabPlan.examDate`
  - `settings.reminder.enabled`
  - `settings.reminder.time`
  - `settings.ai.questionModel`
  - `settings.ai.analysisModel`
  - `settings.ai.analysisFallbackModel`
- `users/{uid}/question_pool/{poolDocId}`
  - `part`, `kind`, `hashId`, `size`, `level`
  - `payload`（Part 6/7 以 passage group 整組保存）
- `users/{uid}/examAttempts/{attemptId}`：完整考卷快照與解析
- `users/{uid}/history/{historyId}`：摘要紀錄
- `users/{uid}/mistakes/{mistakeId}`：錯題
- `users/{uid}/bookmarks/{wordId}`：收藏單字
- `users/{uid}/srs/{wordId}`：SRS 狀態
- `users/{uid}/stats/summary`：統計（含 `masteredWords`, `dayX`）

## Notes
- Part 7 本地題庫目前為 0 題，系統會自動用 Gemini 補題（混合來源策略）。
- 若遇到 429/503，會啟動 Exponential Backoff + Jitter，並顯示重試提示。
- 背景擴充題庫按鈕含鎖定機制，避免連點造成 API 爆量。
- 舊 pool 缺 `level` 會在讀取時做 silent lazy migration，不阻塞頁面。
- Stitch API Key 僅用於本機 MCP 工具鏈，不進前端程式碼、不寫入 Firestore。
