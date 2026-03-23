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
- [x] 撰寫圖片轉幻燈片影片可行性評估報告

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

## Phase 12: CSV URL 顯示
- [x] 在管理面板「系統設定」頁籤中顯示每個目錄的 CSV 匯出 URL

## Phase 13: CSV Video URL 格式轉換
- [x] CSV 匯出中的 video URL 轉換為 Google Drive 直接下載格式 (https://drive.google.com/uc?export=download&id={FILE_ID})

## Phase 14: 上傳檔案命名格式
- [x] 上傳到 Google Drive 的檔案名稱改為 目錄ID_零售商ID_日期 格式

## Phase 15: 公司/團隊共用設定系統
- [x] 設計公司（Company）資料模型：公司名稱、專屬 access token、目錄設定
- [x] 設計成員（Membership）資料模型：用戶與公司的關聯、角色（owner/member）
- [x] 建立資料庫 schema 並遷移
- [x] 實作後端 API：建立公司、邀請成員（透過 email）、共用設定
- [x] 更新管理面板 UI：公司管理、成員邀請、共用設定顯示
- [x] 更新 MainApp：使用公司層級的共用設定（access token、目錄）
- [x] 撰寫測試並驗證所有流程（28/28 passed）

## Phase 16: 圖片轉幻燈片影片功能（獨立頁面）
- [x] 安裝 FFmpeg 和 fluent-ffmpeg
- [x] 建立後端 API：抓取 Catalog 商品圖片
- [x] 建立後端 API：FFmpeg 影片生成（支援轉場、文字疊加、4:5/9:16 比例）
- [x] 建立獨立的「幻燈片影片生成器」前端頁面
- [x] 新增選單導航到新功能頁面
- [x] 支援每張圖片顯示秒數設定
- [x] 支援轉場效果選擇（fade/crossfade/slide/wipe 等）
- [x] 支援商品名稱和自訂文字疊加
- [x] 支援手動上傳額外圖片（Phase 17 完成）
- [x] 整合 Google Drive 上傳和 Catalog 更新（Phase 17 完成）
- [x] 撰寫測試並驗證（39/39 passed）

## Phase 17: 幻燈片生成器增強功能
- [x] 共用目錄設定：幻燈片生成器使用與主工具相同的目錄和存取設定（settingsStore）
- [x] 手動上傳額外圖片：除了目錄商品圖片外，允許用戶上傳自訂圖片加入幻燈片
- [x] 背景音樂功能：讓用戶選擇或上傳背景音樂搭配幻燈片影片
- [x] Google Drive 上傳整合：生成的影片自動上傳到 Google Drive
- [x] Catalog 更新整合：上傳後自動更新 Meta Catalog 商品影片
- [x] 更新 i18n 翻譯
- [x] 撰寫測試並驗證（47/47 passed）

## Phase 18: 幻燈片生成器 Bug 修復 + 新功能
- [x] 修復目錄選擇器無法載入已設定目錄的 Bug（fetch→XMLHttpRequest）
- [x] 新增影片預覽功能（步驟 2 動態幻燈片預覽，支援播放/暫停）
- [x] 新增批次生成功能（支援全選、批次 Drive 上傳、批次 Catalog 更新）
- [x] 更新 i18n 翻譯（中英文完整）
- [x] 撰寫測試並驗證（47/47 passed）

## Phase 19: 重新設計網站圖示
- [x] 設計新的 site icon / favicon（播放鍵+上傳箭頭，藍紫漸層）
- [x] 整合到專案中（index.html, AppFooter, MainApp header）

## Phase 20: 幻燈片生成器完整重設計
- [x] 商品以列表方式呈現（勾選框 + 縮圖 + 名稱 + 圖片數量）
- [x] 批次選擇多個商品，每個商品使用所有圖片（主圖 + additional）
- [x] 支援上傳自訂影片/圖片插入幻燈片
- [x] 可移動商品圖片的顯示位置（上下移動排序）
- [x] 新增字型選擇功能（Noto Sans CJK, Noto Serif CJK, DejaVu Sans, Liberation Sans）
- [x] 新增字體大小調整功能（16-80px 滑桿）
- [x] 新增字體顏色選擇功能（10 預設色 + 自訂色彩選擇器）
- [x] 後端已支援字體顏色參數（fontColor, fontFamily）
- [x] 批次生成：相同設定套用到所有選中商品
- [x] 更新 i18n 翻譯（中英文完整）
- [x] 測試並驗證（47/47 passed）

## Phase 21: 幻燈片背景顏色 + 圖片大小/位置調整
- [x] 新增背景顏色選擇器（預設白色，10 預設色 + 自訂色彩選擇器）
- [x] 新增圖片顯示大小調整（10%-200% 滑桿控制）
- [x] 新增圖片在影片中的位置移動（水平/垂直偏移 -50%~+50%）
- [x] 更新後端 FFmpeg 支援 imageScale 和 imageOffset 參數
- [x] 更新 routers.ts 接受新參數
- [x] 更新前端 SlideshowGenerator UI（即時預覽反映背景色、圖片大小、位置）
- [x] 更新 i18n 翻譯（中英文完整）
- [x] 測試並驗證（47/47 passed）
- [x] 修復 9:16 預覽格式：顯示正確解析度 1080×1920px，預覽區使用正確的 9/16 比例

## Phase 22: 修復預覽與生成影片文字不一致
- [ ] 分析預覽和生成影片的文字差異（字體大小、位置、背景色、圖片縮放）
- [ ] 修復後端 FFmpeg 文字渲染與前端預覽一致
- [ ] 修復前端預覽準確反映生成結果
- [ ] 測試並驗證

## Phase 22: 修復預覽文字不一致 + 影片生成範本系統
- [x] 修復預覽與生成影片文字大小不一致（使用等比例縮放：previewScale = 450/canvasHeight）
- [x] 新增 slideshow_templates 資料表（19 欄位，含所有影片設定）
- [x] 新增範本 CRUD tRPC 程序（list/getById/create/update/delete）
- [x] 前端新增範本 UI：儲存為範本、點擊套用、編輯名稱、以目前設定更新、刪除
- [x] 範本載入後自動填入所有設定（比例、轉場、字型、背景色、圖片大小/位置等）
- [x] 更新 i18n 翻譯（中英文完整）
- [x] 測試並驗證（47/47 passed）
