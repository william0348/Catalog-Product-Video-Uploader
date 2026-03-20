# CPV Uploader 改造 TODO

## Phase 1: 升級全端專案
- [x] 執行 webdev_add_feature (web-db-user)
- [x] 了解新的後端架構和資料庫連線方式

## Phase 2: 資料庫 Schema
- [x] 建立 upload_records 資料表，欄位：catalog_id, retailer_id, product_name, product_image_url, video_4x5_download, video_4x5_embed, video_9x16_download, video_9x16_embed, client_name, upload_timestamp, uploaded_by

## Phase 3: 後端 API
- [x] POST /api/upload-records — 新增上傳記錄
- [x] GET /api/upload-records — 查詢上傳記錄（支援 catalog_id 篩選）
- [x] GET /api/export/csv/:catalogId — 外部可存取的 CSV 匯出端點（供 Meta Catalog 使用）
- [x] CSV 格式：id, video[0].url, video[1].url, #廠商名稱, #Product Name

## Phase 4: 前端改造
- [x] 用 API 呼叫取代 Google Sheet 記錄邏輯
- [x] 上傳成功後同時寫入資料庫
- [x] AdminPanel 顯示資料庫記錄（Video Log tab 保留）

## Phase 5: Apple HIG 設計
- [x] SF Pro 字體系統
- [x] 圓角、間距、按鈕樣式
- [x] 色彩系統
- [x] 動畫和互動效果

## Phase 6: 測試
- [x] 驗證 CSV 端點外部可存取
- [x] 驗證上傳記錄正確寫入資料庫（vitest 9/9 passed）
- [x] 驗證 UI 設計符合 Apple HIG

## Phase 7: Video Log Integration
- [x] Integrate database records into Video Log tab in AdminPanel
- [x] Add search functionality (by product name, retailer ID, client name)
- [x] Add filter by catalog ID dropdown
- [x] Add filter by date range (from/to)
- [x] Add pagination for large datasets
- [x] Add delete record functionality
- [x] Add export XLSX button
- [x] Add stats summary (total records, filtered results, catalog count)
- [x] Style the Video Log table with Apple HIG design

## Phase 8: CSV URL 顯示 + 返回按鈕 + 刪除影片
- [x] 在管理面板顯示每個 Catalog 的 CSV 外部存取 URL
- [x] 每個頁面加上返回上一頁按鈕
- [x] 整合刪除影片功能（Catalog Batch API UPDATE 空值）
- [x] 刪除前先確認商品 ID 在目錄上沒有影片
- [x] 刪除後同步刪除後端資料庫記錄
- [ ] 撰寫圖片轉幻燈片影片可行性評估報告

## Phase 9: 最終測試與發布
- [x] 測試刪除影片功能（Facebook Catalog Batch API 正常運作）
- [x] 測試 CSV 匯出 URL（Meta Catalog 可正確下載）
- [x] 執行完整 vitest 測試並修復回歸問題（15/15 passed）
- [x] 建立 Checkpoint 並發布

## Bug Fixes
- [x] 修復 Facebook Access Token 驗證失敗問題（之前可以，現在顯示「無效的存取金鑰」）
- [x] 修復 settingsStore.ts tRPC 請求格式錯誤（settings.set 回傳 400）
- [x] 修復 settings 無法儲存到資料庫的問題
- [x] 將 Facebook API 呼叫改為透過後端代理（避免 CORS）

## Phase 10: 帳號切換功能
- [x] Google 登入要能更換帳號（不自動使用快取的帳號）

## Phase 11: 文字調整
- [x] 標題從 "RhinoShield x Meta 影片上傳工具" 改為 "Meta 影片上傳工具"
- [x] 目錄標籤從 "CPAS 目錄" 改為 "選擇目錄"
