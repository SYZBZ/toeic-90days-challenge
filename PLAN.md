# PLAN.md — Stitch 對齊與 Gemini 路由現況

## 已完成
1. Gemini 模型路由重構
- 出題：`gemini-2.5-flash`
- 解析主：`gemini-3-flash`
- 解析備援：`gemini-2.5-flash`
- 支援配額/服務忙碌/模型不可用時自動降級

2. 韌性與穩定性
- `429/503` 指數退避 + jitter
- 主模型 cooldown，避免連續撞同一限制
- UI 會顯示等待重試提示

3. Firestore 設定同步
- 新增 `settings.ai`：
  - `questionModel`
  - `analysisModel`
  - `analysisFallbackModel`
- 設定頁可儲存與檢查模型可用性

4. Stitch 連線與 UI 套用
- Stitch MCP 已可用（專案可讀）
- 已套用 Stitch 匯出版型骨架：TopBar + Desktop SideNav + Mobile BottomNav
- Dashboard 與 Practice 版型已改為 Ethereal 風格主結構

## 目前下一步（可選）
1. 做逐頁 1:1 pixel tuning（優先 Dashboard -> Practice -> Settings）
2. 對齊 Stitch 截圖中的字級、區塊密度、間距比例
3. 補齊卡片細節（圖示陰影、氣泡尾巴、互動微動效）

## 驗收條件
- `npm run build` 成功
- 設定頁模型調整後跨裝置可讀
- `gemini-3-flash` 不可用時可自動切換到 `gemini-2.5-flash`
- 手機/桌面皆可用，導航與作答流程不中斷

## 協作約定
- `legacy/` 僅備份，不刪除
- Stitch Key 僅本機工具鏈使用，不入 repo
- Firestore 僅允許 `users/{uid}` 與其子集合
