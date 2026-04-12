# CLAUDE.md

## Repo 現況（請先讀）
此專案已重構為 **Vite + React + Firebase + Gemini**，並已接上 Stitch 設計流程。

- runtime: `src/`
- legacy backup: `legacy/`（不可刪）
- deploy: `.github/workflows/deploy.yml`

## 核心決策（不可回退）
1. Firestore 路徑固定 user-scoped：`users/{uid}` 與子集合
2. 模型路由預設：
   - 出題：`gemini-2.5-flash`
   - 解析主：`gemini-3-flash`
   - 解析備援：`gemini-2.5-flash`
3. Backoff/cooldown/UI retry hint 不可移除
4. `vite.config.js` base 維持 `/toeic-90days-challenge/`
5. Stitch key 僅允許存在本機 MCP 設定，不進前端與資料庫

## Stitch 協作現況
- MCP `stitch` 已可連線並可讀取專案
- 目前 UI 已採用 Ethereal Playground 骨架：
  - 固定 TopBar
  - Desktop SideNav
  - Mobile BottomNav
  - Hero + Bento 內容布局
- 若要「完全 1:1」，請在既有骨架上做逐頁細部對齊，不要推倒重做

## 關鍵檔案
- `src/lib/aiModels.js`: 模型預設與正規化
- `src/lib/geminiClient.js`: backoff + jitter
- `src/lib/geminiService.js`: 模型路由、fallback、cooldown
- `src/lib/firestoreService.js`: profile/history/mistakes/stats CRUD
- `src/ui/*`: 共用 UI 元件
- `src/styles.css`: Stitch/Ethereal 全域風格

## 資料模型（user doc）
- `email`
- `geminiApiKey`
- `settings.level`
- `settings.part`
- `settings.ai.questionModel`
- `settings.ai.analysisModel`
- `settings.ai.analysisFallbackModel`

## 開發指令
```bash
npm install
npm run dev
npm run build
```

## 提交建議
```bash
git add .
git commit -m "feat: align stitch ui and gemini routing"
git push
```
