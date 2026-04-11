# PLAN.md — TOEIC 90 Days App 技術與產品規格

## 產品目標
建立可跨裝置同步的 Serverless TOEIC 刷題 App，支援：
- Email/Password 登入
- Gemini 出題與解析雙模型路由
- 錯題本與歷史記錄雲端同步
- 90 天學習儀表板

## 核心流程
1. 使用者登入
2. 設定頁輸入 Gemini API Key（寫入 Firestore `users/{uid}`）
3. Practice 頁按「產生題目」
4. 先用 `gemini-2.5-flash` 出題（不給答案）
5. 作答後用 `gemini-2.5-pro` 解析
6. 寫入 history/mistakes/summary

## Firestore Schema
- `users/{uid}`
  - `email`
  - `geminiApiKey`
  - `settings`
  - `createdAt` / `updatedAt`
- `users/{uid}/history/{attemptId}`
- `users/{uid}/mistakes/{mistakeId}`
- `users/{uid}/stats/summary`

## 安全策略
`firestore.rules` 僅允許 `request.auth.uid == uid` 的 owner 存取自身資料。

## 部署策略
- `vite.config.js` 設定 base 為 `/toeic-90days-challenge/`
- GitHub Actions 在 `main` push 時自動 build + deploy pages

## 里程碑
- M1: Auth + Firestore 基礎資料流
- M2: Gemini 雙模型 + Backoff
- M3: Dashboard + Mistakes + Legacy 匯入
- M4: GitHub Pages 自動部署 + 文件收斂

## 舊版處理
舊版純靜態網站保留於 `legacy/`，新版不依賴其執行。
