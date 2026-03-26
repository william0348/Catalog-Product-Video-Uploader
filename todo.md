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

## Phase 23: 自訂圖片疊加 + 移除商品名稱
- [x] 後端 FFmpeg 支援疊加圖片（下載 overlay → 縮放至目標寬度 → 疊加到每張處理後的圖片）
- [x] 更新 routers.ts 接受 overlayImageUrl, overlayImageScale, overlayImageX, overlayImageY 參數
- [x] 前端新增疊加圖片上傳 UI（上傳自訂圖片如 logo/浮水印，支援 PNG/JPG/WebP）
- [x] 前端新增疊加圖片位置/大小調整控制（5%-100% 縮放，水平/垂直 -50%~+50% 偏移）
- [x] 移除「顯示商品名稱」功能（showProductName）
- [x] 更新 i18n 翻譯（中英文完整）
- [x] 測試並驗證（47/47 passed）

## Phase 24: 影片疊加（背景影片）+ 片頭片尾
- [x] 後端 FFmpeg 支援背景影片（影片作為背景，商品圖片疊加在上方，使用 colorkey 去背）
- [x] 後端 FFmpeg 支援片頭影片（normalize 解析度/幀率後 concat）
- [x] 後端 FFmpeg 支援片尾影片（normalize 解析度/幀率後 concat）
- [x] 新增影片上傳 tRPC endpoint（uploadVideo，最大 50MB）
- [x] 更新 routers.ts 接受 backgroundVideoUrl, introVideoUrl, outroVideoUrl 參數
- [x] 前端新增影片上傳 UI（背景影片、片頭影片、片尾影片各自獨立上傳）
- [x] 更新 i18n 翻譯（中英文完整）
- [x] 測試並驗證（47/47 passed）

## Phase 25: 移除自訂圖片上傳功能
- [x] 移除步驟 1 中的「上傳自訂圖片」區塊
- [x] 新增拖曳上傳支援（疊加圖片、背景影片、片頭影片、片尾影片、背景音樂）
- [x] 拖曳區域視覺回饋（拖曳時高亮邊框 + 藍色陰影）
- [x] 預覽畫面拖曳定位：可直接拖曳商品圖片和疊加圖片調整位置（grab/grabbing 游標）

## Phase 26: 修復 FFmpeg ENOENT 錯誤
- [x] 診斷部署環境中 FFmpeg 不可用的問題
- [x] 安裝 @ffmpeg-installer/ffmpeg npm 套件提供 bundled FFmpeg 二進位檔
- [x] 更新 slideshow.ts 使用 createRequire + 自動偵測路徑 + 系統 fallback
- [x] 新增字體存在性檢查和優雅降級
- [x] 測試並驗證（47/47 passed，FFmpeg verified）

## Phase 27: 修復影片生成失敗 + 影片預覽 + 懸浮預覽
- [x] 改用 ffmpeg-static 作為主要 FFmpeg 來源（更可靠），改善錯誤處理和日誌
- [x] 修復 colorkey 使用用戶設定的背景色而非硬編碼白色
- [x] 上傳的影片可在預覽區域播放查看（背景/片頭/片尾各有播放器）
- [x] 預覽面板懸浮（sticky），隨頁面捲動保持可見
- [x] 測試並驗證（47/47 passed）

## Phase 28: 移除開始畫面
- [x] 移除 HomePage，一開始直接顯示影片上傳工具主畫面（MainApp）

## Phase 29: 修復影片生成失敗（Facebook CDN URL 過期問題）
- [x] 根本原因：Facebook CDN 圖片 URL 會過期（403 Forbidden），後端無法下載
- [x] 修復方案：前端先將圖片代理下載並上傳到 S3，用 S3 永久 URL 生成影片
- [x] 新增 /api/trpc/slideshow.proxyUploadImage 和 proxyUploadImages 端點
- [x] 前端在生成影片前，先批次代理上傳所有 Facebook CDN 圖片到 S3
- [x] 改善 downloadFile 錯誤處理（加入 3 次重試機制、User-Agent header、更好的錯誤訊息）
- [x] 測試並驗證（52/52 passed）

## Phase 30: 修復背景影片合成時不應去背商品圖片
- [x] 分析問題：使用背景影片時，FFmpeg colorkey 將商品圖片的背景色移除了
- [x] 修復 FFmpeg 合成邏輯：背景影片模式下，商品圖片應完整疊加（不去背）
- [x] 測試並驗證（52/52 passed）

## Phase 31: 重新設計導航 - 側邊 Menu
- [ ] 分析目前頁面結構和所有功能入口
- [ ] 使用 DashboardLayout 設計側邊 Menu
- [ ] 將所有功能按鈕移入側邊 Menu（影片上傳工具、幻燈片生成器、管理面板、系統設定等）
- [ ] 重構 App.tsx 路由結構配合側邊 Menu
- [ ] 重構各頁面移除重複的 header/nav 元素
- [ ] 確保語言切換、登入按鈕等在側邊 Menu 中正確顯示
- [ ] 測試並驗證

## Phase 31: 重新設計導航 - 側邊 Menu + 影片生成器加寬
- [x] 分析目前頁面結構和所有功能入口
- [x] 設計側邊 Menu 導航結構
- [x] 將所有功能按鈕移入側邊 Menu（影片上傳工具、幻燈片生成器、管理面板、服務條款）
- [x] 重構 App.tsx 路由結構配合側邊 Menu
- [x] 重構各頁面移除重複的 header/nav 元素（移除導航按鈕、LanguageSwitcher）
- [x] 影片生成器在電腦版加寬（maxWidth 900 → 1400）
- [x] 語言切換、Google 登入按鈕在側邊 Menu 底部顯示
- [x] 手機版側邊 Menu 可收合（漢堡選單 + overlay）
- [x] 測試通過（52/52 passed）

## Phase 32: 幻燈片生成器 - 商品組合選擇 + 修復影片生成失敗
- [x] 改善影片生成錯誤處理（顯示 HTTP 狀態碼、區分網路錯誤/伺服器錯誤/超時）
- [x] 幻燈片生成器新增商品組合（Product Set）選擇功能
- [x] 新增後端端點：fetchProductSets、fetchProductSetProducts、fetchAllProductSetProducts
- [x] 首次只讀取 1000 個商品，超過時顯示「讀取全部商品」按鈕
- [x] 前端 UI 新增商品組合下拉選單、商品計數、讀取全部按鈕
- [x] i18n 翻譯（中/英）
- [x] 測試通過（60/60 passed）

## Phase 33: 選擇商品組合後自動載入商品
- [x] 選擇商品組合後自動觸發 handleFetchProducts（useEffect 監聽 selectedProductSetId）
- [x] 測試通過（60/60 passed）

## Phase 34: 預覽畫面加入 IG Reels Organic UI 元素
- [x] 研究 IG Reels UI 佈局（Reels icon、互動按鈕、用戶名、CTA 等）
- [x] 建立 ReelsOverlay 組件（左上 Reels 文字+相機圖標、右側 Like/Comment/Share/Save/More 按鈕、音樂光碟）
- [x] 底部元素：Sponsored 標籤、用戶名+Follow、描述文字、音樂資訊、Shop Now CTA 按鈕
- [x] 新增 Reels 開關按鈕（Instagram 漸層色）可切換顯示/隱藏 overlay
- [x] 測試通過（60/60 passed）

## Phase 35: 建立 GitHub README.md
- [x] 分析專案結構和核心功能
- [x] 撰寫專業的 README.md（影片上傳工具為主，幻燈片先不寫）
- [x] 儲存 checkpoint

## Phase 36: 移除 Google Sheets 相關功能（已改用資料庫）
- [x] 審計所有 Google Sheets 相關程式碼
- [x] 移除 Google Sheets 相關常數（MASTER_GOOGLE_SHEET_ID, SHEET_TAB_NAME, GOOGLE_APPS_SCRIPT_URL, SHEET_DATA_HEADER, ADMIN_ACCESS_SHEET_TAB_NAME）
- [x] 移除 getColumnLetter 函數（僅用於 Sheets）
- [x] 移除 GOOGLE_API_SCOPES 中的 spreadsheets scope
- [x] 移除 gapi.client.init 中的 Sheets API discovery doc
- [x] 更新 README.md：移除 Google Sheets Integration 章節，新增 Upload Record Management 章節
- [x] 測試通過（60/60 passed）

## Phase 37: 預覽面板 9:16 等比例放大
- [x] 調整預覽面板為 1080x1920 (9:16) 等比例顯示（maxHeight 450→1650, grid 1:1→1:1.2）
- [x] Step 3 影片播放器也使用 9:16 等比例容器 + Reels overlay
- [x] 更新 previewScale 計算配合新尺寸
- [x] 測試通過（60/60 passed）

## Phase 38: 修復影片生成 503 錯誤（部署環境）
- [ ] 調查 503 錯誤原因（FFmpeg 在部署環境可能不可用）
- [ ] 修復根本原因
- [ ] 測試並驗證

## Phase 38: 修復影片生成 503 錯誤 + 移除系統設定
- [ ] 調查部署環境 FFmpeg 不可用的替代方案
- [ ] 實作替代方案（瀏覽器端影片生成 or 其他）
- [ ] 移除系統設定區塊（已有公司設定取代）
- [ ] 測試並驗證

## Phase 38: FFmpeg WASM 瀏覽器端影片生成 + 移除重複系統設定
- [x] 建立 client/src/lib/videoGenerator.ts - 瀏覽器端 FFmpeg WASM 影片生成器
- [x] 整合到 SlideshowGenerator.tsx handleGenerate（優先使用瀏覽器端，fallback 到伺服器端）
- [x] 整合到 SlideshowGenerator.tsx handleBatchGenerate（同上）
- [x] 新增 uploadVideoToS3 函數：瀏覽器生成的影片上傳到 S3
- [x] 新增 isFFmpegWASMSupported 檢查函數
- [x] 新增 COOP + COEP headers（Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: credentialless）啟用 SharedArrayBuffer
- [x] 使用 credentialless（而非 require-corp）避免阻擋 Google APIs 和 Facebook CDN 等外部資源
- [x] 移除 AdminPanel 中重複的「系統設定」tab（SettingsManager 組件）
- [x] 系統設定現在只存在於公司設定（CompanyDetail）中
- [x] 測試通過（60/60 passed）

## Bug Fix: 刪除影片紀錄後仍然顯示 + 管理面板未連接公司設定
- [x] 修復 deleteVideoFromCatalog：Facebook API 失敗時仍應刪除 DB 記錄（改為 try-catch 包裹 FB API 呼叫）
- [x] 管理面板 Video Log 連接公司設定：使用公司的 catalogs 和 access token
- [x] 刪除時正確傳遞 companyId
- [x] 管理面板新增公司篩選器 + 公司欄位
- [x] MainApp saveUploadRecord 傳入 companyId
- [x] XLSX 匯出加入公司名稱
- [x] 更新測試用例以匹配新行為
- [x] 全部 60/60 測試通過

## Bug Fix: 側邊欄 Google 登入按鈕無法點擊
- [x] 調查原因：App.tsx 沒有傳遞 auth props 給 AppLayout
- [x] 建立 GoogleAuthContext 共享 Google 登入狀態
- [x] 更新 App.tsx 傳遞 auth props 給 AppLayout
- [x] 重構 MainApp 使用 GoogleAuthContext（移除重複的 Google 初始化邏輯）
- [x] 重構 SlideshowGenerator 使用 GoogleAuthContext
- [x] 全部 60/60 測試通過

## Phase 39: 移除幻燈片生成器中所有影片結合功能
- [x] 移除背景影片（backgroundVideo）相關 UI 和狀態
- [x] 移除片頭影片（introVideo）相關 UI 和狀態
- [x] 移除片尾影片（outroVideo）相關 UI 和狀態
- [x] 移除後端 uploadVideo endpoint（替換為 uploadGeneratedVideo）
- [x] 移除後端 FFmpeg 影片合成邏輯（背景影片、片頭片尾 concat）
- [x] 移除前端影片預覽播放器
- [x] 更新 routers.ts 移除影片相關參數
- [x] 更新 videoGenerator.ts 移除影片合成邏輯
- [x] 全部 60/60 測試通過

## Phase 40: 存取密碼改為可選
- [x] 如果管理員未設定存取密碼，使用者不需要輸入密碼
- [x] 密碼欄位在無需密碼時自動隱藏
- [x] 修改 handleFetchData 驗證邏輯：無密碼設定時跳過驗證
- [x] 修改 allFieldsFilled 判斷：無密碼設定時不要求 accessKey
- [x] 全部 60/60 測試通過

## Bug Fix: 上傳畫面表格第一列（表頭）被擋住
- [x] 調查表格 thead 被遮擋的 CSS 問題：data-header fixed 定位在 sidebar 佈局中遮擋內容
- [x] 修復：app-content 內 data-header 改為 sticky，filters 調整 top 值，thead th 加入 sticky 定位
- [x] 全部 60/60 測試通過

## Bug Fix: 表格標題未對齊 + 頂部區域固定
- [x] 讓標題欄 + 篩選欄 + 表頭行全部 sticky 固定在頂部
- [x] data-header sticky z-index:30, filters sticky z-index:20, thead sticky z-index:10
- [x] 移除 table-container overflow-x 避免破壞 sticky 定位
- [x] 全部 60/60 測試通過

## Bug Fix: 頂部區塊 sticky 未生效（根本原因修復）
- [x] 確認根本原因：app-layout 和 app-main 沒有固定高度，導致滾動發生在 body 而非 app-content
- [x] 修復 app-layout: height: 100vh + overflow: hidden
- [x] 修復 app-main: height: 100vh + overflow: hidden
- [x] 修復 app-content: overflow-y: auto + overflow-x: hidden（唯一滾動容器）
- [x] 修復 .app-content .filters 明確設定 position: sticky + 背景色
- [x] 全部 60/60 測試通過

## Bug Fix: Sticky 區塊視覺問題修復
- [x] data-header 滾動時寬度縮進去 → 使用負 margin 突破 app-content padding，填滿整個寬度
- [x] 篩選區塊（filters）左右沒有對齊 → 同樣使用負 margin + 對應 padding，桌面版 40px / 手機版 24px
- [x] 表格行穿越上方 sticky 功能區塊 → 改用不透明白色背景（#ffffff）取代半透明 rgba
- [x] 上方功能區塊整塊填滿寬度 → 移除 card 的 border-radius 和 shadow，加入 border-bottom 分隔線
- [x] 全部 60/60 測試通過

## Bug Fix: Sticky 表頭重疊 + 內容未置中對齊（方案重寫 v2）
- [x] 新方案：加入 app-content--full-width class，移除 app-content padding，讓 data-header/filters 自然填滿寬度
- [x] AppLayout 加入 fullWidthContent prop，在 data-view 頁面時傳入 true
- [x] data-header 和 filters 用 var(--content-pad) 保持內容水平間距
- [x] table-container 在 full-width 模式下加 padding 保持對齊
- [x] z-index 層級：data-header(100) > filters(90) > thead(10)
- [x] 翻譯更新：「公司管理」→「公司,目錄,人員管理」
- [x] 全部 60/60 測試通過

## Bug Fix: 表頭（thead）要永遠 fixed 不隨滾動消失
- [x] 用 ResizeObserver + CSS custom property (--thead-sticky-top) 動態計算 thead top 值
- [x] 在 MainApp 加入 dataHeaderRef 和 filtersRef，監聽高度變化
- [x] CSS 使用 var(--thead-sticky-top, 140px) 作為 fallback
- [x] 全部 60/60 測試通過

## Phase 41: Excel 批次匯入 + 側邊欄調整 + CSV URL 改名
- [x] 前端 Excel 匯入：解析 Excel（目錄 ID、零售商 ID、影片網址），呼叫 createBatch API 批次寫入 DB
- [x] 匯入預覽對話框：顯示前 50 筆資料讓用戶確認
- [x] 智能欄位對應：支援中英文欄位名稱自動匹配
- [x] 側邊欄順序：影片上傳 → 幻燈片 → 管理面板 → 服務條款
- [x] CSV URL 改名為「目錄補充資料網址」
- [x] i18n 翻譯更新（中英文）
- [x] 全部 60/60 測試通過

## Phase 42: 移除舊系統設定（目錄 + Access Token）
- [x] 分析並找到所有使用舊系統設定的地方（MainApp、SlideshowGenerator、AdminPanel、routers.ts）
- [x] MainApp：移除 loadSettings/loadSettingsFromServer/saveSettings fallback，沒有公司時清空 catalogs 和 token
- [x] SlideshowGenerator：移除 XHR settings.getAll 和 loadSettings fallback
- [x] 後端 deleteVideoFromCatalog：移除 getSetting("facebookAccessToken") fallback，只用公司 token
- [x] 清理不再使用的 import（loadSettings、saveSettings、loadSettingsFromServer）
- [x] 更新測試：將 2 個使用全域 token 的測試改為使用公司 token
- [x] 全部 60/60 測試通過

## Phase 43: 移除 CSV 中的廠商名稱和 Product Name 欄位
- [x] 找到 CSV 生成程式碼（server/_core/index.ts 的 /api/export/csv/:catalogId 端點）
- [x] 移除 #廠商名稱 和 #Product Name 欄位（header 和 row data）
- [x] 清理不再使用的 clientName 變數和 getSetting import
- [x] 全部 60/60 測試通過

## Phase 44: CSV 匯出改為 XML 格式（RSS/Google Merchant）
- [x] 新增 /api/export/xml/:catalogId 端點，輸出 RSS/Google Merchant XML 格式
- [x] XML 格式使用 RSS + g: namespace，每個 item 包含 g:id 和兩個 video > url
- [x] 舊 CSV 端點自動 redirect 到 XML 端點（向後相容）
- [x] 更新前端 AdminPanel 的 URL 生成為 /api/export/xml/
- [x] 更新 CSS 註解
- [x] 全部 60/60 測試通過

## Phase 45: 確保公司目錄在未登入時也可讀取
- [ ] 檢查目前 catalog 載入邏輯，確認是否需要登入才能讀取公司的目錄列表
- [ ] 確保前端在未登入時仍能載入公司設定的目錄
- [ ] 測試並驗證

## Phase 45: 確保管理員 email 驗證後才能看到目錄
- [ ] 檢查目前公司/目錄載入邏輯：管理員輸入 email 後才能看到自己公司的目錄
- [ ] 確認 Access Token 只在後端使用，不暴露給前端
- [ ] 確認未輸入 email 的用戶看不到任何目錄
- [ ] 測試並驗證

## Phase 45: 修復 XML 中 URL 的 & 被 escape 成 &amp; 問題
- [x] 使用 CDATA 包裹 video URL，保持原始格式（& 不再被轉換成 &amp;）
- [x] 全部 60/60 測試通過

## Phase 46: 管理面板顯示上傳人員列表
- [x] 檢查 upload_records 是否有記錄操作者資訊（email/名稱）
- [x] 後端新增 API 查詢上傳過影片的人員列表（從上傳紀錄中提取）
- [x] 前端在管理面板顯示上傳人員列表（包含上傳次數、最後上傳時間、相關目錄）
- [x] 測試並驗證（63/63 passed）

## Bug Fix: XML 匯出中 URL 的 & 字元未正確處理
- [x] 檢查 XML 生成程式碼中 CDATA 包裹是否正確
- [x] 修復 video URL 中的 & 字元（使用 CDATA 包裹）
- [x] 測試並驗證 XML 格式正確（63/63 passed + Python XML 驗證通過）

## Bug Fix: Meta Catalog 無法正確匯入 XML feed
- [x] 研究 Meta Catalog 的 Feed 規格（supplementary feed / data feed）
- [x] 修復格式：從自訂 XML 改為 Meta 標準 CSV 格式（id, video[0].url, video[1].url）
- [x] 測試並驗證（63/63 passed，CSV 輸出正確）

## Bug Fix: Meta 透過 feed URL 抓取 CSV 失敗（手動上傳成功）
- [ ] 診斷 Meta crawler 無法抓取 feed URL 的原因
- [ ] 修復 feed endpoint 以相容 Meta 的爬蟲
- [ ] 測試並驗證

## Phase 47: 設定 Lion Tech Logo 為網站 favicon
- [x] 處理 Logo 圖片為 favicon 格式
- [x] 上傳並設定為網站 site icon（favicon、sidebar、footer）

## Phase 48: 製作 Lion Tech Solution 介紹影片
- [x] 撰寫影片腳本（痛點、解決方案、功能介紹）
- [x] 生成參考圖片和視覺素材（8 張參考圖）
- [x] 生成影片片段並組裝最終影片（8 clips + 旁白 + BGM，50秒 1080p）

## Phase 49: 介紹影片改為全英文旁白 + 音量加大
- [x] 重新生成英文旁白語音（7 clips）
- [x] 調大旁白和 BGM 音量（narration 3x + loudnorm）
- [x] 重新組裝最終影片（50s 1080p 16.4MB）

## Phase 50: 更新 GitHub README.md
- [ ] 加入 Manus 整合說明（需移除內建登入系統）
- [ ] 說明需自行整合 login 功能

## Phase 50: 更新 GitHub README.md
- [ ] 加入 Manus 整合說明（需移除內建 Manus Login 系統，自行整合登入功能）

## Phase 50: 更新 GitHub README.md
- [x] 加入 Manus 整合說明：需移除內建 Manus Login，用戶只需整合自己的 Google Login Client ID

## Phase 51: 移除 RhinoShield + Google Client ID 移至環境變數
- [x] 移除所有 RhinoShield 相關引用（README.md, i18n.ts）
- [x] 將 Google Client ID 從硬編碼移至 VITE_GOOGLE_CLIENT_ID 環境變數（65/65 passed）

## Phase 52: 重新命名為 Meta Catalog Product Video Uploader
- [x] 搜尋並替換所有 CPAS Video Upload 相關名稱
- [x] 移除所有 CPAS 專屬描述，改為通用的 Meta Catalog 定位（65/65 passed）

## Phase 53: Access Token 到期日提醒
- [x] 調查目前 token 儲存方式和到期日管理
- [x] 實作 token 到期日追蹤（後端 + 資料庫 tokenExpiresAt 欄位）
- [x] 在首頁顯示到期提醒（接近 1 週黃色警告，已過期紅色警告）
- [x] 測試並驗證（75/75 passed）

## Phase 54: 將 Google Client ID 硬編碼到程式碼中
- [x] 將 Client ID 寫入 constants.ts 作為預設值（env 變數優先）

## Phase 55: 上傳 Cloud Run 部署指南到 GitHub
- [x] 將 deploy-manus-to-cloudrun.md 加入專案根目錄

## Phase 56: 撰寫詳細 Manus 平台遷移指南
- [x] 分析專案中所有 Manus 專屬依賴和功能
- [x] 撰寫完整遷移指南 MD 文件（給其他 AI / 開發者參考）
- [ ] 上傳到 GitHub 並儲存 checkpoint
