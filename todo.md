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
