# PLAN.md

## TOEIC 90 Days 重構計畫（已落地版本）

## 2026-04-12 最新完成
- 每日單字頁改為與單字庫一致的卡片 UI（共用元件），功能一致：
  - 收藏 `★`
  - 發音 `🔊`
  - 熟練 `+1`
- 設定頁「開啟每日提醒」checkbox 排版修正，不再錯位。
- 單字小遊戲改為回合制狀態機：
  - `idle -> playing -> finished`
  - 可選 `10 題` 或 `20 題`
  - 完成後顯示結算，不再無限下一題。

## 2026-04-12 Listening Engine（Spark / Client-only）
- `/practice` 新增閱讀/聽力切換，聽力支援 Part 1~4。
- 前端多模態流程：Gemini 產題 -> TTS/Imagen REST -> Firebase Storage 直傳 -> `question_pool`。
- Part 3/4 使用 SSML 多口音單次合成，固定 3 題一組，preset 為 `9x5`、`18x10`。
- 新增全局 Audio Manager，切題/切頁/unmount 會 `pause + src 清空 + URL 回收`。
- 新增 `storage.rules`，限制 `users/{uid}/audio/*`、`users/{uid}/images/*` 只能 owner 讀寫。

## Adaptive Difficulty Engine（新增）
- 目標分數三檔：`470 / 730 / 860`
- 等級映射：`green / blue / gold`
- 出題 prompt 會依 `targetLevel` 注入對應難度限制，並強制每題回傳 `difficulty`
- Hybrid 調度改為 `part + targetLevel` 過濾後再套用 Step A~E
- `question_pool` 新增 `level` 欄位
- 缺 `level` 的舊 pool 採 silent lazy migration（不阻塞使用者）
- 背景擴充題庫按鈕加入鎖定機制，防止連點打爆 API

### Phase 1：核心可用版
- 考試流程重構：設定 -> 作答 -> 交卷 -> 詳解 -> 歷史回顧
- 模式：Part 5 / Part 6 / Part 7 / 綜合
- 題數時間：10x5、20x10
- 綜合配比：
  - 10 題：Part5/6/7 = 5/3/2
  - 20 題：Part5/6/7 = 8/6/6
- 題源：本地題庫優先，不足時 Gemini 補題（Part 7 必定補題）
- 解析：交卷後批次解析（題目中譯、選項中譯、正解理由、陷阱）
- 歷史回顧：儲存完整考卷快照，可回看當次內容
- 單字庫：接 `data/vocabulary.json`，支援搜尋/篩選/收藏
- 語法頁：接 `data/grammar.json`，10 單元 + 小測
- 頁面拆分：
  - `/progress` 進度頁
  - `/mistakes` 錯題本
  - `/review` 單字複習（SRS）

### Phase 2：中期體驗版
- 每日提醒（Web Notifications）
- PWA 離線（manifest + service worker）
- Sidebar 折疊（桌面，64px icon-only）
- Topbar 真資料（已熟練單字、連續天數、帳號頭像）
- 單字小遊戲（中英配對 + 拼字，5 秒節奏）

## 資料模型
- `users/{uid}`
  - `settings.examPreset`: `10x5 | 20x10`
  - `settings.targetScore`: `470 | 730 | 860`
  - `settings.targetLevel`: `green | blue | gold`
  - `settings.reminder`: `{ enabled, time }`
  - `settings.ai`: `{ questionModel, analysisModel, analysisFallbackModel }`
- `users/{uid}/question_pool/{poolDocId}`
  - `part`, `kind`, `hashId`, `size`, `level`, `payload`
- `users/{uid}/examAttempts/{attemptId}`：完整考卷
- `users/{uid}/mistakes/{mistakeId}`：錯題
- `users/{uid}/bookmarks/{wordId}`：收藏
- `users/{uid}/srs/{wordId}`：SRS 狀態
- `users/{uid}/stats/summary`
  - `masteredWords`
  - `dayX`

## 目前決策
- Part 7 題源：混合來源（本地優先，不足補 Gemini）
- 詳解生成：交卷後批次解析
- SRS 熟練定義：單字答對 >= 3 次
- 本輪不做：暗色模式（8）、快捷鍵（9）

## 驗收重點
- 四種模式都能開考、時間到自動交卷
- 每題詳解含：題目翻譯 + 選項翻譯 + 正解理由 + 陷阱解析
- 歷史可回看完整考卷
- 單字/語法頁不再顯示「內容搬移中」
- Progress/Mistakes/Review 各自獨立
- PWA 可安裝、提醒可設定與測試
