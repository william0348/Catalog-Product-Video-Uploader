# Manus 平台遷移指南 — 完整拆解手冊

> **目標讀者**：其他 AI Agent 或開發者，需要將本專案從 Manus 平台遷移到自建環境（Cloud Run、VPS、Vercel 等）。
>
> **本文件目的**：逐一列出所有 Manus 平台專屬的功能、模組、環境變數，說明哪些必須移除、哪些需要替換、以及推薦的替代方案。

---

## 目錄

1. [架構總覽](#1-架構總覽)
2. [Manus 專屬功能清單](#2-manus-專屬功能清單)
3. [第一步：移除 Manus OAuth 登入系統](#3-第一步移除-manus-oauth-登入系統)
4. [第二步：替換 S3 儲存代理](#4-第二步替換-s3-儲存代理)
5. [第三步：移除 LLM 代理](#5-第三步移除-llm-代理)
6. [第四步：移除通知系統](#6-第四步移除通知系統)
7. [第五步：移除 Google Maps 代理](#7-第五步移除-google-maps-代理)
8. [第六步：移除圖片生成服務](#8-第六步移除圖片生成服務)
9. [第七步：移除語音轉文字服務](#9-第七步移除語音轉文字服務)
10. [第八步：移除 Data API 代理](#10-第八步移除-data-api-代理)
11. [第九步：移除 Vite 開發環境插件](#11-第九步移除-vite-開發環境插件)
12. [第十步：替換資料庫連線](#12-第十步替換資料庫連線)
13. [第十一步：修改伺服器啟動邏輯](#13-第十一步修改伺服器啟動邏輯)
14. [第十二步：移除前端 Manus 登入 UI](#14-第十二步移除前端-manus-登入-ui)
15. [第十三步：移除分析追蹤腳本](#15-第十三步移除分析追蹤腳本)
16. [第十四步：清理環境變數](#16-第十四步清理環境變數)
17. [第十五步：建立自己的認證系統](#17-第十五步建立自己的認證系統)
18. [環境變數對照表](#18-環境變數對照表)
19. [檔案處理清單](#19-檔案處理清單)
20. [部署到其他平台](#20-部署到其他平台)

---

## 1. 架構總覽

本專案在 Manus 平台上的技術架構如下：

```
┌─────────────────────────────────────────────────────────┐
│                    Manus 平台                            │
│                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │ Frontend │──▶│ Express/tRPC │──▶│ MySQL (TiDB)   │  │
│  │ React 19 │   │ Server       │   │ DATABASE_URL   │  │
│  │ Vite 7   │   │              │   └────────────────┘  │
│  └──────────┘   │              │                        │
│                 │              │──▶ Manus Forge API     │
│                 │              │    ├─ OAuth 認證        │
│                 │              │    ├─ S3 儲存代理       │
│                 │              │    ├─ LLM 代理          │
│                 │              │    ├─ 通知服務          │
│                 │              │    ├─ Google Maps 代理  │
│                 │              │    ├─ 圖片生成          │
│                 │              │    ├─ 語音轉文字        │
│                 │              │    └─ Data API 代理     │
│                 └──────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

所有標記為「Manus Forge API」的服務都是透過 `BUILT_IN_FORGE_API_URL` 和 `BUILT_IN_FORGE_API_KEY` 這兩個環境變數來存取的。遷移時，這些服務需要逐一替換為你自己的服務或第三方 API。

---

## 2. Manus 專屬功能清單

下表列出本專案中所有 Manus 平台專屬的功能模組，以及它們在本專案中的實際使用狀況：

| 功能模組 | 檔案位置 | 本專案是否實際使用 | 遷移優先級 | 替代方案 |
|---------|---------|-----------------|-----------|---------|
| OAuth 登入系統 | `server/_core/oauth.ts`, `server/_core/sdk.ts` | 有（但本專案主要用 Google OAuth） | **必須處理** | 自建 JWT 或 Passport.js |
| S3 儲存代理 | `server/storage.ts` | **有，大量使用**（影片上傳、圖片代理） | **必須替換** | AWS S3 / GCS / Cloudflare R2 |
| LLM 代理 | `server/_core/llm.ts` | 未使用 | 可直接刪除 | OpenAI API / Gemini API |
| 通知服務 | `server/_core/notification.ts` | 未使用 | 可直接刪除 | Email / Slack Webhook |
| Google Maps 代理 | `server/_core/map.ts`, `client/src/components/Map.tsx` | 未使用 | 可直接刪除 | Google Maps API Key |
| 圖片生成 | `server/_core/imageGeneration.ts` | 未使用 | 可直接刪除 | DALL-E API / Stable Diffusion |
| 語音轉文字 | `server/_core/voiceTranscription.ts` | 未使用 | 可直接刪除 | Whisper API |
| Data API 代理 | `server/_core/dataApi.ts` | 未使用 | 可直接刪除 | 直接呼叫各 API |
| Vite 插件 | `vite-plugin-manus-runtime` | 有（開發環境） | **必須移除** | 不需要替代 |
| Debug Collector | `vite.config.ts`, `client/public/__manus__/` | 有（開發環境） | **必須移除** | 不需要替代 |
| 分析追蹤 | `client/index.html` (Umami) | 有 | 選擇性移除 | 自建 Umami / Google Analytics |
| Manus 登入對話框 | `client/src/components/ManusDialog.tsx` | 有（但可能未啟用） | 應移除 | 自建登入 UI |
| useAuth Hook | `client/src/_core/hooks/useAuth.ts` | 有（tRPC auth） | **必須替換** | 自建 auth hook |
| 前端 tRPC 認證 | `client/src/main.tsx`, `client/src/const.ts` | 有 | **必須修改** | 移除 Manus 重導向邏輯 |
| System Router | `server/_core/systemRouter.ts` | 有（health check + notify） | 保留 health，移除 notify | 自建 health endpoint |
| Session/Cookie 管理 | `server/_core/cookies.ts`, `server/_core/context.ts` | 有 | **必須替換** | 自建 session 管理 |

---

## 3. 第一步：移除 Manus OAuth 登入系統

Manus 平台提供了一套完整的 OAuth 登入系統，包含前端登入頁面跳轉、後端 token 交換、JWT session 管理。本專案實際上使用的是 **Google OAuth 2.0**（透過 Google Identity Services），Manus OAuth 只是平台強制注入的外層。

### 3.1 需要修改的檔案

**`server/_core/oauth.ts`** — 完全移除或清空

這個檔案負責處理 Manus OAuth 回調（`/api/oauth/callback`），接收 authorization code 並交換 access token。由於本專案使用 Google OAuth，這個端點不再需要。

```typescript
// 移除整個 registerOAuthRoutes 函數
// 或者將檔案內容替換為空的 export：
import type { Express } from "express";
export function registerOAuthRoutes(app: Express) {
  // Manus OAuth removed — using Google OAuth instead
}
```

**`server/_core/sdk.ts`** — 大幅簡化

這個檔案是 Manus OAuth 的核心，包含了：
- `OAuthService` 類別：與 Manus OAuth 伺服器通訊
- `SDKServer` 類別：管理 session token 的簽發和驗證
- `authenticateRequest` 方法：從 cookie 中驗證使用者身份

你需要保留 JWT session 驗證的邏輯（`verifySession`、`createSessionToken`），但移除所有與 Manus OAuth 伺服器通訊的程式碼：

```typescript
// 需要移除的部分：
// - OAuthService 類別（整個）
// - exchangeCodeForToken 方法
// - getUserInfo 方法（透過 Manus OAuth token）
// - getUserInfoWithJwt 方法
// - deriveLoginMethod 方法
// - EXCHANGE_TOKEN_PATH, GET_USER_INFO_PATH, GET_USER_INFO_WITH_JWT_PATH 常數

// 需要保留的部分：
// - SessionPayload 型別
// - createSessionToken 方法
// - signSession 方法
// - verifySession 方法
// - authenticateRequest 方法（但需要修改為不依賴 Manus OAuth）
```

**`server/_core/env.ts`** — 移除 Manus 專屬環境變數

```diff
 export const ENV = {
-  appId: process.env.VITE_APP_ID ?? "",
   cookieSecret: process.env.JWT_SECRET ?? "",
   databaseUrl: process.env.DATABASE_URL ?? "",
-  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
-  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
   isProduction: process.env.NODE_ENV === "production",
-  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
-  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
+  // 替換為你自己的 S3 設定（如果使用 S3 儲存）
+  s3Bucket: process.env.S3_BUCKET ?? "",
+  s3Region: process.env.S3_REGION ?? "",
+  s3AccessKey: process.env.S3_ACCESS_KEY ?? "",
+  s3SecretKey: process.env.S3_SECRET_KEY ?? "",
 };
```

### 3.2 前端登入流程修改

**`client/src/const.ts`** — 移除 Manus 登入 URL 生成

```diff
-export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
-
-export const getLoginUrl = () => {
-  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
-  const appId = import.meta.env.VITE_APP_ID;
-  const redirectUri = `${window.location.origin}/api/oauth/callback`;
-  const state = btoa(redirectUri);
-  const url = new URL(`${oauthPortalUrl}/app-auth`);
-  url.searchParams.set("appId", appId);
-  url.searchParams.set("redirectUri", redirectUri);
-  url.searchParams.set("state", state);
-  url.searchParams.set("type", "signIn");
-  return url.toString();
-};
+export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
+
+// 本專案使用 Google OAuth，不需要 Manus 登入 URL
+// Google 登入由 GoogleAuthContext 處理
+export const getLoginUrl = () => "/";
```

**`client/src/main.tsx`** — 移除 Manus 未授權重導向

```diff
 // 移除這段 Manus 未授權自動跳轉邏輯：
-const redirectToLoginIfUnauthorized = (error: unknown) => {
-  if (!(error instanceof TRPCClientError)) return;
-  if (typeof window === "undefined") return;
-  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
-  if (!isUnauthorized) return;
-  window.location.href = getLoginUrl();
-};
-
-queryClient.getQueryCache().subscribe(event => {
-  if (event.type === "updated" && event.action.type === "error") {
-    const error = event.query.state.error;
-    redirectToLoginIfUnauthorized(error);
-    console.error("[API Query Error]", error);
-  }
-});
-
-queryClient.getMutationCache().subscribe(event => {
-  if (event.type === "updated" && event.action.type === "error") {
-    const error = event.mutation.state.error;
-    redirectToLoginIfUnauthorized(error);
-    console.error("[API Mutation Error]", error);
-  }
-});
```

---

## 4. 第二步：替換 S3 儲存代理

**這是本專案最關鍵的替換項目**，因為影片上傳、圖片代理等核心功能都依賴 S3 儲存。

### 4.1 目前的運作方式

Manus 平台透過 `BUILT_IN_FORGE_API_URL` 提供了一個 S3 儲存代理，檔案上傳和下載都透過這個代理進行，不需要直接設定 AWS 憑證。

**`server/storage.ts`** 中的關鍵函數：
- `storagePut(relKey, data, contentType)` — 上傳檔案到 S3
- `storageGet(relKey)` — 取得檔案的預簽名下載 URL

### 4.2 替換為直接使用 AWS S3

專案已經安裝了 `@aws-sdk/client-s3` 和 `@aws-sdk/s3-request-presigner`，你可以直接使用：

```typescript
// server/storage.ts — 替換為直接 S3 存取
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "ap-northeast-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET!;

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: typeof data === "string" ? Buffer.from(data) : data,
    ContentType: contentType,
  }));

  // 如果 bucket 是公開的，直接回傳 URL
  const url = `https://${BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`;
  return { key, url };
}

export async function storageGet(
  relKey: string,
  expiresIn = 3600
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  
  const url = await getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }), { expiresIn });

  return { key, url };
}
```

### 4.3 替代方案：Google Cloud Storage

如果你部署在 GCP 上，可以使用 Google Cloud Storage 替代 S3：

```typescript
import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);

export async function storagePut(relKey: string, data: Buffer, contentType: string) {
  const file = bucket.file(relKey);
  await file.save(data, { contentType, resumable: false });
  const url = `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${relKey}`;
  return { key: relKey, url };
}
```

### 4.4 使用到 storagePut 的地方

以下是 `server/routers.ts` 中所有使用 `storagePut` 的端點，遷移後這些都需要正常運作：

| 端點 | 用途 | 行號 |
|------|------|------|
| `slideshow.uploadGeneratedVideo` | 上傳瀏覽器端生成的影片到 S3 | ~562 |
| `slideshow.proxyUploadImage` | 代理上傳 Facebook CDN 圖片到 S3（避免 URL 過期） | ~623 |
| `slideshow.proxyUploadImages` | 批次代理上傳多張圖片 | ~677 |
| `slideshow.uploadOverlayImage` | 上傳疊加圖片（logo/浮水印） | ~706 |
| `slideshow.uploadAudio` | 上傳背景音樂 | ~727 |
| `slideshow.uploadFont` | 上傳自訂字體 | ~745 |

---

## 5. 第三步：移除 LLM 代理

**`server/_core/llm.ts`** — 本專案未使用此功能

這個模組提供了 `invokeLLM()` 函數，透過 Manus Forge API 呼叫 LLM（預設使用 `gemini-2.5-flash`）。本專案沒有任何地方呼叫這個函數，可以安全刪除。

如果未來需要 LLM 功能，替代方案：

```typescript
// 使用 OpenAI SDK
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
```

---

## 6. 第四步：移除通知系統

**`server/_core/notification.ts`** 和 **`server/_core/systemRouter.ts`** 中的 `notifyOwner`

Manus 通知系統透過 Forge API 發送通知給專案擁有者。本專案未使用此功能。

處理方式：
1. 刪除 `server/_core/notification.ts`
2. 從 `server/_core/systemRouter.ts` 移除 `notifyOwner` mutation（保留 `health` query）

```typescript
// server/_core/systemRouter.ts — 簡化版
import { z } from "zod";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0) }))
    .query(() => ({ ok: true })),
});
```

---

## 7. 第五步：移除 Google Maps 代理

**`server/_core/map.ts`** 和 **`client/src/components/Map.tsx`**

Manus 提供了 Google Maps API 的代理，不需要自己的 API Key。本專案未使用地圖功能，可以安全刪除這兩個檔案。

如果未來需要地圖功能，直接申請 Google Maps API Key 即可。

---

## 8. 第六步：移除圖片生成服務

**`server/_core/imageGeneration.ts`**

透過 Manus Forge API 呼叫圖片生成服務。本專案未使用，可以安全刪除。

---

## 9. 第七步：移除語音轉文字服務

**`server/_core/voiceTranscription.ts`**

透過 Manus Forge API 呼叫 Whisper 語音轉文字。本專案未使用，可以安全刪除。

---

## 10. 第八步：移除 Data API 代理

**`server/_core/dataApi.ts`**

Manus 的 Data API Hub 提供了多種第三方 API 的統一存取介面（YouTube、SimilarWeb 等）。本專案未使用，可以安全刪除。

---

## 11. 第九步：移除 Vite 開發環境插件

### 11.1 移除 `vite-plugin-manus-runtime`

**`vite.config.ts`** 中引入了 `vite-plugin-manus-runtime`，這是 Manus 平台的開發環境插件，用於注入運行時資訊。

```diff
-import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

-const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
+const plugins = [react(), tailwindcss(), jsxLocPlugin()];
```

### 11.2 移除 Debug Collector

`vite.config.ts` 中的 `vitePluginManusDebugCollector()` 函數和相關的日誌收集邏輯（約 150 行）可以完全移除。同時刪除 `client/public/__manus__/` 目錄。

### 11.3 移除 Manus 專屬的 allowedHosts

```diff
 server: {
   host: true,
-  allowedHosts: [
-    ".manuspre.computer",
-    ".manus.computer",
-    ".manus-asia.computer",
-    ".manuscomputer.ai",
-    ".manusvm.computer",
-    "localhost",
-    "127.0.0.1",
-  ],
+  allowedHosts: true,
 },
```

### 11.4 從 `package.json` 移除 Manus 專屬 devDependency

```diff
-  "vite-plugin-manus-runtime": "^0.0.57",
```

### 11.5 簡化後的 `vite.config.ts`

```typescript
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: true,
  },
});
```

---

## 12. 第十步：替換資料庫連線

### 12.1 目前的設定

Manus 平台提供了一個 MySQL (TiDB) 資料庫，透過 `DATABASE_URL` 環境變數連線。本專案使用 Drizzle ORM 搭配 `mysql2` 驅動。

**`drizzle.config.ts`** 和 **`server/db.ts`** 都使用 `process.env.DATABASE_URL`。

### 12.2 遷移選項

**選項 A：繼續使用 MySQL**

如果你使用 Cloud SQL、PlanetScale 或其他 MySQL 服務，只需要設定正確的 `DATABASE_URL`：

```
DATABASE_URL=mysql://user:password@host:3306/database_name
```

**選項 B：改用 SQLite（最簡單）**

如果你不需要雲端資料庫，可以改用 SQLite：

1. 安裝 `better-sqlite3`：`pnpm add better-sqlite3 @types/better-sqlite3`
2. 修改 `drizzle/schema.ts`：將所有 `mysqlTable` 改為 `sqliteTable`，`mysqlEnum` 改為 `text`
3. 修改 `drizzle.config.ts`：`dialect` 從 `"mysql"` 改為 `"sqlite"`
4. 修改 `server/db.ts`：使用 `drizzle-orm/better-sqlite3`

**選項 C：改用 PostgreSQL**

類似 MySQL 的修改，但使用 `pg` 驅動和 `drizzle-orm/node-postgres`。

### 12.3 資料庫遷移

無論選擇哪個選項，都需要在新環境中執行 schema 遷移：

```bash
# 設定 DATABASE_URL 環境變數後
pnpm db:push
```

---

## 13. 第十一步：修改伺服器啟動邏輯

**`server/_core/index.ts`** 是伺服器的入口點，需要做以下修改：

### 13.1 移除 Vite 開發伺服器整合

生產環境不需要 Vite，開發環境可以分開啟動 Vite dev server：

```diff
-import { serveStatic, setupVite } from "./vite";

 // 在 startServer 函數中：
-if (process.env.NODE_ENV === "development") {
-  await setupVite(app, server);
-} else {
-  serveStatic(app);
-}
+// 生產環境：提供靜態檔案
+import path from "path";
+import fs from "fs";
+
+const distPath = process.env.NODE_ENV === "development"
+  ? path.resolve(import.meta.dirname, "../..", "dist", "public")
+  : path.resolve(import.meta.dirname, "public");
+
+if (fs.existsSync(distPath)) {
+  app.use(express.static(distPath));
+  app.use("*", (_req, res) => {
+    res.sendFile(path.resolve(distPath, "index.html"));
+  });
+}
```

### 13.2 移除 OAuth 路由註冊

```diff
-import { registerOAuthRoutes } from "./oauth";
-registerOAuthRoutes(app);
```

### 13.3 保留的部分

以下部分應該保留，因為它們是業務邏輯而非 Manus 專屬：
- CSV 匯出端點（`/api/export/csv/:catalogId`）
- JSON 匯出端點（`/api/export/json/:catalogId`）
- XML 重導向端點（`/api/export/xml/:catalogId`）
- tRPC API 中介軟體（`/api/trpc`）
- COOP/COEP headers（FFmpeg WASM 需要）
- Body parser 設定（50mb limit）

---

## 14. 第十二步：移除前端 Manus 登入 UI

### 14.1 移除 ManusDialog 元件

**`client/src/components/ManusDialog.tsx`** — 這是 Manus 平台的登入對話框，顯示「Login with Manus」按鈕。可以安全刪除。

### 14.2 修改 useAuth Hook

**`client/src/_core/hooks/useAuth.ts`** — 這個 hook 透過 tRPC 的 `auth.me` query 檢查使用者是否已登入。

本專案實際使用的是 **Google OAuth**（透過 `GoogleAuthContext`），Manus 的 `useAuth` hook 可能不會被直接呼叫。檢查是否有任何元件使用了 `useAuth()`，如果沒有，可以安全刪除。

如果有使用，需要替換為你自己的認證 hook。

### 14.3 移除 DashboardLayout 中的 Manus 登入

**`client/src/components/DashboardLayout.tsx`** — 如果有使用這個元件，檢查其中是否有 Manus 登入相關的邏輯。

---

## 15. 第十三步：移除分析追蹤腳本

**`client/index.html`** 中有 Manus 的 Umami 分析追蹤腳本：

```diff
-<script
-  defer
-  src="%VITE_ANALYTICS_ENDPOINT%/umami"
-  data-website-id="%VITE_ANALYTICS_WEBSITE_ID%"></script>
```

如果你想保留網站分析功能，可以替換為：
- 自建 Umami 實例
- Google Analytics
- Plausible Analytics

---

## 16. 第十四步：清理環境變數

### 16.1 需要移除的 Manus 專屬環境變數

```bash
# Manus OAuth 相關（必須移除）
VITE_APP_ID
VITE_OAUTH_PORTAL_URL
OAUTH_SERVER_URL
OWNER_OPEN_ID
OWNER_NAME

# Manus Forge API（必須移除）
BUILT_IN_FORGE_API_URL
BUILT_IN_FORGE_API_KEY
VITE_FRONTEND_FORGE_API_KEY
VITE_FRONTEND_FORGE_API_URL

# Manus 分析（選擇性移除）
VITE_ANALYTICS_ENDPOINT
VITE_ANALYTICS_WEBSITE_ID
```

### 16.2 需要保留的環境變數

```bash
# 資料庫（必須保留，更換為你的資料庫 URL）
DATABASE_URL=mysql://user:password@host:3306/dbname

# JWT Secret（必須保留，用於 session 簽名）
JWT_SECRET=your-random-secret-string

# Google OAuth（本專案核心功能）
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

### 16.3 需要新增的環境變數

```bash
# S3 儲存（替代 Manus Forge Storage）
S3_BUCKET=your-bucket-name
S3_REGION=ap-northeast-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key

# 或者使用 Google Cloud Storage
GCS_BUCKET=your-gcs-bucket
```

---

## 17. 第十五步：建立自己的認證系統

本專案的認證架構比較特殊：**Manus OAuth 是平台層的認證，Google OAuth 是業務層的認證**。

### 17.1 目前的認證流程

```
使用者 → Manus 登入頁面 → Manus OAuth callback → 建立 session cookie
                                                    ↓
使用者 → Google 登入按鈕 → Google OAuth → 取得 Google Access Token
                                          ↓
                                    存入 GoogleAuthContext
                                    用於 Google Drive API、Google Sheets API
```

### 17.2 遷移後的建議認證流程

移除 Manus OAuth 後，你有兩個選擇：

**選項 A：只用 Google OAuth（推薦）**

本專案的核心功能（Google Drive 上傳、Meta Catalog API）都需要 Google 帳號，因此直接用 Google OAuth 作為唯一的認證方式最為合理。

```
使用者 → Google 登入按鈕 → Google OAuth → 取得 ID Token + Access Token
                                          ↓
                              後端驗證 ID Token → 建立 JWT session cookie
                              前端使用 Access Token 呼叫 Google API
```

**選項 B：完全移除後端認證**

如果你不需要後端的使用者管理功能（公司管理、成員邀請等），可以完全移除後端認證，只在前端使用 Google OAuth。

### 17.3 實作 Google OAuth 後端驗證

```typescript
// server/auth.ts — 新的認證模組
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);

export async function verifyGoogleToken(idToken: string) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.VITE_GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    email: payload?.email,
    name: payload?.name,
    picture: payload?.picture,
    googleId: payload?.sub,
  };
}
```

---

## 18. 環境變數對照表

| Manus 環境變數 | 用途 | 遷移後替代 | 必要性 |
|---------------|------|-----------|--------|
| `DATABASE_URL` | MySQL 資料庫連線 | 保留，更換為你的 DB URL | **必要** |
| `JWT_SECRET` | Session cookie 簽名 | 保留，自行生成隨機字串 | **必要** |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID | 保留 | **必要** |
| `VITE_APP_ID` | Manus OAuth App ID | 移除 | — |
| `VITE_OAUTH_PORTAL_URL` | Manus 登入頁面 URL | 移除 | — |
| `OAUTH_SERVER_URL` | Manus OAuth 伺服器 | 移除 | — |
| `OWNER_OPEN_ID` | Manus 專案擁有者 ID | 移除 | — |
| `OWNER_NAME` | Manus 專案擁有者名稱 | 移除 | — |
| `BUILT_IN_FORGE_API_URL` | Manus Forge API 基礎 URL | 移除，替換為各服務自己的 URL | — |
| `BUILT_IN_FORGE_API_KEY` | Manus Forge API 金鑰 | 移除，替換為各服務自己的金鑰 | — |
| `VITE_FRONTEND_FORGE_API_KEY` | 前端 Forge API 金鑰 | 移除 | — |
| `VITE_FRONTEND_FORGE_API_URL` | 前端 Forge API URL | 移除 | — |
| `VITE_ANALYTICS_ENDPOINT` | Umami 分析端點 | 移除或替換 | 選擇性 |
| `VITE_ANALYTICS_WEBSITE_ID` | Umami 網站 ID | 移除或替換 | 選擇性 |
| `VITE_APP_TITLE` | 網站標題 | 保留或硬編碼 | 選擇性 |
| `VITE_APP_LOGO` | 網站 Logo URL | 保留或硬編碼 | 選擇性 |
| — | S3 儲存設定 | 新增 `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | **必要** |

---

## 19. 檔案處理清單

### 可以安全刪除的檔案

這些檔案完全是 Manus 平台專屬的，本專案沒有實際使用其核心功能：

| 檔案路徑 | 說明 |
|---------|------|
| `server/_core/llm.ts` | LLM 代理（未使用） |
| `server/_core/notification.ts` | 通知服務（未使用） |
| `server/_core/map.ts` | Google Maps 代理（未使用） |
| `server/_core/imageGeneration.ts` | 圖片生成（未使用） |
| `server/_core/voiceTranscription.ts` | 語音轉文字（未使用） |
| `server/_core/dataApi.ts` | Data API 代理（未使用） |
| `server/_core/types/manusTypes.ts` | Manus OAuth 型別定義 |
| `client/src/components/ManusDialog.tsx` | Manus 登入對話框 |
| `client/src/components/Map.tsx` | Google Maps 元件（未使用） |
| `client/src/components/AIChatBox.tsx` | AI 聊天元件（未使用） |
| `client/src/components/DashboardLayout.tsx` | Dashboard 佈局（未使用） |
| `client/src/components/DashboardLayoutSkeleton.tsx` | Dashboard 骨架屏（未使用） |
| `client/src/pages/ComponentShowcase.tsx` | 元件展示頁（開發用） |
| `client/public/__manus__/` | Manus Debug Collector 目錄 |
| `.manus-logs/` | Manus 日誌目錄 |

### 需要修改的檔案

| 檔案路徑 | 修改內容 |
|---------|---------|
| `server/_core/index.ts` | 移除 OAuth 路由、移除 Vite 開發伺服器整合 |
| `server/_core/env.ts` | 移除 Manus 專屬環境變數，新增 S3 設定 |
| `server/_core/sdk.ts` | 移除 Manus OAuth 通訊，保留 JWT session 管理 |
| `server/_core/oauth.ts` | 清空或替換為 Google OAuth callback |
| `server/_core/context.ts` | 修改認證邏輯 |
| `server/_core/cookies.ts` | 可能需要調整 cookie 設定 |
| `server/_core/systemRouter.ts` | 移除 notifyOwner，保留 health |
| `server/_core/trpc.ts` | 保留，但確認 protectedProcedure 的認證邏輯 |
| `server/storage.ts` | **重寫**為直接使用 AWS S3 或 GCS |
| `server/routers.ts` | 確認所有 storagePut 呼叫在新 storage 下正常運作 |
| `client/src/const.ts` | 移除 Manus 登入 URL 生成 |
| `client/src/main.tsx` | 移除未授權重導向邏輯 |
| `client/src/_core/hooks/useAuth.ts` | 替換或移除 |
| `client/index.html` | 移除 Umami 分析腳本 |
| `vite.config.ts` | 移除 Manus 插件和 Debug Collector |
| `package.json` | 移除 `vite-plugin-manus-runtime` |
| `shared/const.ts` | 保留，但可移除 `UNAUTHED_ERR_MSG` 和 `NOT_ADMIN_ERR_MSG`（如果不再使用） |

### 不需要修改的檔案（業務邏輯）

| 檔案路徑 | 說明 |
|---------|------|
| `client/src/App.tsx` | 應用路由（業務邏輯） |
| `client/src/pages/MainApp.tsx` | 主要上傳功能 |
| `client/src/pages/AdminPanel.tsx` | 管理面板 |
| `client/src/pages/SlideshowGenerator.tsx` | 幻燈片生成器 |
| `client/src/contexts/GoogleAuthContext.tsx` | Google OAuth（業務邏輯） |
| `client/src/contexts/LanguageContext.tsx` | 多語言（業務邏輯） |
| `client/src/lib/google.ts` | Google API 工具函數 |
| `client/src/lib/videoGenerator.ts` | FFmpeg WASM 影片生成 |
| `client/src/i18n.ts` | 翻譯檔案 |
| `server/slideshow.ts` | 幻燈片生成後端邏輯 |
| `server/db.ts` | 資料庫查詢函數（保留，但需確認 DB 連線） |
| `drizzle/schema.ts` | 資料庫 schema（保留） |

---

## 20. 部署到其他平台

### 20.1 Google Cloud Run

請參考 `deploy-manus-to-cloudrun.md` 文件，該文件提供了完整的 Cloud Run 部署步驟。

### 20.2 Docker Compose（自建 VPS）

```yaml
# docker-compose.yml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://user:password@db:3306/cpv_uploader
      - JWT_SECRET=your-random-secret
      - VITE_GOOGLE_CLIENT_ID=your-google-client-id
      - S3_BUCKET=your-bucket
      - S3_REGION=ap-northeast-1
      - S3_ACCESS_KEY=your-key
      - S3_SECRET_KEY=your-secret
    depends_on:
      - db

  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=rootpassword
      - MYSQL_DATABASE=cpv_uploader
      - MYSQL_USER=user
      - MYSQL_PASSWORD=password
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

volumes:
  mysql_data:
```

### 20.3 Railway / Render

這些平台支援 Docker 部署，使用上述 Dockerfile 即可。設定環境變數後直接部署。

### 20.4 Vercel（僅前端）

如果你只想部署前端（不需要後端 API），可以使用 Vercel：

1. 將後端 API 改為 Vercel Serverless Functions
2. 或者將後端部署在其他地方，前端透過 API URL 連線

> **注意**：本專案的後端功能（CSV 匯出、影片生成、S3 上傳）比較重，不建議使用 Serverless 架構。推薦使用 Cloud Run 或 VPS。

---

## 附錄：遷移檢查清單

完成遷移後，請逐一確認以下功能正常運作：

- [ ] 網站可以正常啟動，首頁可以載入
- [ ] Google OAuth 登入功能正常
- [ ] 可以建立和管理公司
- [ ] 可以設定 Facebook Access Token 和目錄
- [ ] 可以從 Meta Catalog 讀取商品列表
- [ ] 可以上傳影片到 Google Drive
- [ ] 上傳記錄正確寫入資料庫
- [ ] CSV 匯出端點可以正常存取（`/api/export/csv/:catalogId`）
- [ ] 管理面板的 Video Log 可以正常顯示
- [ ] 幻燈片生成器可以正常生成影片（瀏覽器端 FFmpeg WASM）
- [ ] 生成的影片可以上傳到 S3
- [ ] 圖片代理上傳功能正常（Facebook CDN → S3）
- [ ] Excel 批次匯入功能正常
- [ ] Access Token 過期提醒正常顯示
- [ ] 多語言切換正常（中文/英文）

---

> **最後提醒**：`server/_core/` 目錄下的檔案是 Manus 平台的基礎架構，修改時請特別小心。建議先在本地環境測試所有修改，確認功能正常後再部署到生產環境。如果你只是想快速跑起來，最關鍵的三件事是：**(1) 替換 S3 儲存**、**(2) 移除 Vite 插件**、**(3) 設定資料庫連線**。
