# TOEIC 90 Days Challenge (Serverless)

Vite + React + Firebase + Gemini 的多益刷題 Web App。

## 技術棧
- Frontend: Vite + React + React Router
- Auth/DB: Firebase Authentication + Firestore
- AI: `@google/generative-ai`
  - 出題: `gemini-2.5-flash`
  - 解析: `gemini-2.5-pro`
- Deploy: GitHub Actions -> GitHub Pages

## 目錄說明
- `src/`: 新版 App 程式碼
- `legacy/`: 舊版純靜態網站完整備份
- `firestore.rules`: Firestore 安全規則（僅 owner 可讀寫）
- `.github/workflows/deploy.yml`: Pages 自動部署

## 快速開始

### 1) 安裝依賴
```bash
npm install
```

### 2) 設定環境變數
複製 `.env.example` 為 `.env`，填入 Firebase Web config：
```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### 3) 啟動開發
```bash
npm run dev
```

### 4) Build
```bash
npm run build
npm run preview
```

## Firebase 設定
1. 啟用 Authentication -> Email/Password。
2. 建立 Firestore (Native mode)。
3. 在 Firebase Console 匯入 `firestore.rules`。
4. Firestore 結構：
   - `users/{uid}`
   - `users/{uid}/history/{attemptId}`
   - `users/{uid}/mistakes/{mistakeId}`
   - `users/{uid}/stats/summary`

## API Key 同步
- 使用者在設定頁輸入 `GEMINI_API_KEY`。
- Key 會儲存在 `users/{uid}.geminiApiKey`。
- 換裝置登入同帳號會自動載入。

## 韌性設計
Gemini 呼叫使用 `callGeminiWithBackoff()`：
- 針對 `429/503` 做 Exponential Backoff with Jitter
- 前端會顯示「預計幾秒後重試」的提示

## GitHub Pages 部署
`deploy.yml` 已設定 push 到 `main` 自動部署。

### 初始化與推送（本機）
```bash
git init
git add .
git commit -m "feat: serverless toeic app with firebase and gemini"
```

若尚未安裝 GitHub CLI：
```bash
winget install --id GitHub.cli -e
```

建立並推送到 GitHub：
```bash
gh auth login
gh repo create toeic-90days-challenge --public --source . --remote origin --push
```

## 舊版資料匯入
設定頁有「匯入舊版 localStorage」按鈕，會把以下資料搬到 Firestore：
- `toeic.examHistory`
- `toeic.mistakes`
- `toeic.stats`

## 注意
- 本專案是純前端 serverless，請勿把 API key 寫在程式碼或 commit 到 repo。
- `legacy/` 僅供回溯，不參與新版 runtime。
