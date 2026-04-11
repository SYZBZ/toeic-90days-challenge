# CLAUDE.md

## 專案狀態
本 repo 已重構為 **Vite + React + Firebase + Gemini** 的 serverless web app。

- 新版 runtime: `src/`
- 舊版備份: `legacy/`
- 部署: `.github/workflows/deploy.yml`

## 協作 AI 注意事項
此 repo 會由 Codex 與 Claude Code 協作，請遵守：
1. **不要刪除 `legacy/`**，它是回溯與資料匯入來源。
2. Firestore 路徑固定為 `users/{uid}` 以及其子集合，不得改成全域集合。
3. Gemini 路由固定：
   - 出題 `gemini-2.5-flash`
   - 解析 `gemini-2.5-pro`
4. Backoff 行為不可移除：`429/503` 必須重試且 UI 要顯示等待提示。
5. `vite.config.js` 的 `base` 需維持 `/toeic-90days-challenge/` 以支援 GitHub Pages。

## 程式結構
- `src/context/AuthContext.jsx`: Auth 狀態與 profile 載入
- `src/lib/firestoreService.js`: Firestore CRUD 與 legacy 匯入
- `src/lib/geminiClient.js`: Exponential Backoff with Jitter
- `src/lib/geminiService.js`: 出題/解析 prompt 與模型路由
- `src/pages/*`: Login, Dashboard, Practice, Review, Settings

## Firestore 規則
- 檔案：`firestore.rules`
- 核心原則：只允許 owner（`request.auth.uid == uid`）讀寫

## 變更紀錄（本次重構）
- 舊版靜態檔案已備份到 `legacy/`
- 根目錄切換為 React/Vite 專案
- 新增 Firebase Auth + Firestore 同步架構
- 新增 Gemini 雙模型調度與 backoff
- 新增 GitHub Pages Actions workflow

## 開發指令
```bash
npm install
npm run dev
npm run build
```

## 發佈指令（人工執行）
```bash
git init
git add .
git commit -m "feat: serverless toeic app"
gh auth login
gh repo create toeic-90days-challenge --public --source . --remote origin --push
```
