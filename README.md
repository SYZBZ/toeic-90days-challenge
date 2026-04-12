# README.md — TOEIC 90 Days Challenge (Serverless)

Vite + React + Firebase + Gemini 的多益刷題 App。現在已完成：
- Gemini 雙模型路由（2.5 出題 / 3 解析 / 2.5 備援）
- Firestore 跨裝置同步 API Key 與模型設定
- Stitch MCP 連線成功（可讀取 Stitch 專案）
- UI 改為 Ethereal Playground / Stitch 匯出版型骨架

## 技術棧
- Frontend: Vite + React + React Router
- Auth/DB: Firebase Authentication + Firestore
- AI: `@google/generative-ai`
  - 出題：`gemini-2.5-flash`
  - 解析主：`gemini-3-flash`
  - 解析備援：`gemini-2.5-flash`
- Deploy: GitHub Actions -> GitHub Pages
- Design workflow: Stitch MCP（僅本機工具鏈）

## 快速開始
1. 安裝依賴
```bash
npm install
```

2. 設定 `.env`
```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

3. 啟動
```bash
npm run dev
```

4. 建置
```bash
npm run build
npm run preview
```

## Firestore 結構
- `users/{uid}`
  - `email`
  - `geminiApiKey`
  - `settings.level`
  - `settings.part`
  - `settings.ai.questionModel`
  - `settings.ai.analysisModel`
  - `settings.ai.analysisFallbackModel`
- `users/{uid}/history/{attemptId}`
- `users/{uid}/mistakes/{mistakeId}`
- `users/{uid}/stats/summary`

## Gemini 韌性策略
- `429/503`：Exponential Backoff with Jitter
- 主模型不可用（配額/服務忙碌/未開通）時自動降級到備援模型
- 主模型 cooldown：短時間內避免重複撞限流模型
- 設定頁支援一鍵檢查模型可用性

## Stitch 整合現況
- 已確認 MCP 可連線並可讀取專案/畫面（`list_projects` 成功）
- UI 已套用 Stitch 匯出風格骨架：
  - 固定 TopBar
  - Desktop SideNav
  - Mobile BottomNav
  - Hero + Bento 內容區

## 安全注意
- Stitch API Key 僅限本機 MCP 設定使用
- 禁止把 Stitch key 寫入前端程式碼、`.env`、Firestore 或 git 歷史
- 若 key 曾公開，請先 rotate 再使用

## 專案目錄
- `src/`: 新版 App 程式碼
- `src/ui/`: 共用 UI 元件層
- `legacy/`: 舊版靜態網站備份（不可刪）
- `firestore.rules`: Firestore 安全規則
- `.github/workflows/deploy.yml`: Pages 自動部署
