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
18. [使用 Firebase Authentication 整合 Google Login（免費方案）](#18-使用-firebase-authentication-整合-google-login免費方案)
19. [環境變數對照表](#19-環境變數對照表)
20. [檔案處理清單](#20-檔案處理清單)
21. [資料庫結構說明](#21-資料庫結構說明)
22. [部署到其他平台](#22-部署到其他平台)

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

## 18. 使用 Firebase Authentication 整合 Google Login（免費方案）

如果你不想自己從零建立認證系統，推薦使用 **Firebase Authentication** 來整合 Google Login。Firebase 的 Spark Plan（免費方案）提供每月 50,000 個活躍使用者 (MAU) 和每日 3,000 個活躍使用者 (DAU) 的免費額度，對於大多數企業內部工具來說綁綁有餘。

### 18.1 Firebase 免費方案限制

| 項目 | Spark Plan（免費） | Blaze Plan（付費） |
|------|----------------|----------------|
| 每月活躍使用者 (MAU) | 50,000 | 無限制（超過免費額度後按用量計費） |
| 每日活躍使用者 (DAU) | 3,000 | 無限制 |
| Email/密碼登入 | ✔ 免費 | ✔ 免費 |
| Google 登入 | ✔ 免費 | ✔ 免費 |
| Facebook 登入 | ✔ 免費 | ✔ 免費 |
| 電話簡訊驗證 | 10,000 次/月 | 按用量計費 |
| 安全性功能 | 基本 | 進階（多因子認證、封鎖保護等） |

### 18.2 設定步驟

#### Step 1：建立 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/) 並登入 Google 帳號
2. 點擊「新增專案」，輸入專案名稱（例如 `cpv-uploader`）
3. 可以選擇是否啟用 Google Analytics（對認證功能不是必要的）
4. 專案建立完成後，點擊左側選單「Build」→「Authentication」→「Get Started」
5. 在「Sign-in method」分頁中，點擊「Google」並啟用它
6. 填入專案的公開名稱和支援 email，然後儲存

#### Step 2：取得 Firebase 設定

在 Firebase Console 中，點擊「專案設定」（齒輪圖示）→「一般」→ 向下捲動到「您的應用程式」→ 點擊 Web 應用程式圖示 (`</>`)。註冊應用程式後，你會取得以下設定：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

將這些值設定為環境變數：

```env
# .env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

#### Step 3：安裝依賴

```bash
# 前端 Firebase SDK
pnpm add firebase

# 後端 Firebase Admin SDK（用於驗證 Token）
pnpm add firebase-admin
```

### 18.3 前端整合

#### 建立 Firebase 設定檔

```typescript
// client/src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 要求 Google 提供額外的 scope（例如 Google Drive 存取權）
googleProvider.addScope("https://www.googleapis.com/auth/drive.readonly");

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };
```

#### 建立 Firebase Auth Context

```typescript
// client/src/contexts/FirebaseAuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "@/lib/firebase";

interface FirebaseAuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextType | null>(null);

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase 會自動維護登入狀態（包含重新整理後自動恢復）
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google sign-in failed:", error);
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const getIdToken = async () => {
    if (!user) return null;
    // Firebase 會自動縮存和刷新 Token
    return user.getIdToken();
  };

  return (
    <FirebaseAuthContext.Provider
      value={{ user, loading, signInWithGoogle, logout, getIdToken }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error("useFirebaseAuth must be used within FirebaseAuthProvider");
  }
  return context;
}
```

#### 在前端使用 Firebase Auth

```tsx
// client/src/pages/LoginPage.tsx
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

export function LoginPage() {
  const { signInWithGoogle, loading } = useFirebaseAuth();

  return (
    <div className="flex items-center justify-center min-h-screen">
      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="flex items-center gap-2 px-6 py-3 bg-white border rounded-lg shadow hover:shadow-md"
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt="Google"
          className="w-5 h-5"
        />
        使用 Google 帳號登入
      </button>
    </div>
  );
}
```

#### 將 Firebase ID Token 傳送給後端

在每次 tRPC 請求中自動附帶 Firebase ID Token：

```typescript
// client/src/lib/trpc.ts 修改
import { auth } from "@/lib/firebase";

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const user = auth.currentUser;
        if (user) {
          const token = await user.getIdToken();
          return { Authorization: `Bearer ${token}` };
        }
        return {};
      },
    }),
  ],
});
```

### 18.4 後端整合

#### 初始化 Firebase Admin SDK

```typescript
// server/firebaseAdmin.ts
import admin from "firebase-admin";

// 方法 1：使用 Service Account JSON 檔案（推薦用於生產環境）
// 從 Firebase Console → 專案設定 → 服務帳戶 → 產生新的私密金鑰
// 將下載的 JSON 檔案路徑設定為環境變數
if (!admin.apps.length) {
  // 如果部署在 Google Cloud 上（Cloud Run、GCE 等），
  // Firebase Admin SDK 會自動使用 Application Default Credentials，
  // 不需要額外的 Service Account 檔案
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(
          require("fs").readFileSync(
            process.env.GOOGLE_APPLICATION_CREDENTIALS,
            "utf8"
          )
        )
      ),
    });
  } else {
    // Google Cloud 環境自動認證
    admin.initializeApp();
  }
}

export default admin;
```

> **提示**：如果你的應用部署在 Google Cloud Run 上，Firebase Admin SDK 會自動使用 Application Default Credentials (ADC)，不需要額外設定 Service Account。只需確保 Cloud Run 服務帳戶有 `Firebase Authentication Admin` 權限即可。

#### 修改 tRPC Context 驗證 Firebase Token

將原本的 Manus SDK 認證替換為 Firebase Token 驗證：

```typescript
// server/_core/context.ts 修改
import admin from "../firebaseAdmin";
import { getUserByEmail, upsertUserByEmail } from "../db";

export async function createContext(opts: { req: Request; res: Response }) {
  let user = null;

  try {
    const authHeader = opts.req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (token) {
      // 驗證 Firebase ID Token
      const decodedToken = await admin.auth().verifyIdToken(token);

      // 自動建立或更新使用者記錄
      user = await upsertUserByEmail({
        email: decodedToken.email || "",
        name: decodedToken.name || decodedToken.email || "Unknown",
        firebaseUid: decodedToken.uid,
        picture: decodedToken.picture || null,
        lastSignedIn: new Date(),
      });
    }
  } catch (error) {
    // Token 無效或過期，user 保持為 null
    console.error("[Auth] Firebase token verification failed:", error);
  }

  return { user, req: opts.req, res: opts.res };
}
```

#### 新增資料庫 Helper 函式

```typescript
// server/db.ts 新增
export async function upsertUserByEmail(data: {
  email: string;
  name: string;
  firebaseUid: string;
  picture: string | null;
  lastSignedIn: Date;
}) {
  // 先查找現有使用者
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);

  if (existing.length > 0) {
    // 更新現有使用者
    await db
      .update(users)
      .set({
        name: data.name,
        openId: data.firebaseUid, // 重用 openId 欄位儲存 Firebase UID
        lastSignedIn: data.lastSignedIn,
      })
      .where(eq(users.id, existing[0].id));
    return existing[0];
  } else {
    // 建立新使用者
    const [result] = await db.insert(users).values({
      openId: data.firebaseUid,
      name: data.name,
      email: data.email,
      role: "user",
      lastSignedIn: data.lastSignedIn,
    });
    return { id: result.insertId, ...data, role: "user" as const };
  }
}
```

### 18.5 Schema 調整建議

原本的 `users` 表中的 `openId` 欄位儲存的是 Manus 平台的使用者 ID。遷移到 Firebase 後，你可以選擇：

**選項 A：重用 `openId` 欄位（最簡單）**

直接將 Firebase UID 存入 `openId` 欄位，不需要修改 schema。上面的範例程式碼就是採用這個方式。

**選項 B：新增 `firebaseUid` 欄位（更清晰）**

```typescript
// drizzle/schema.ts 修改
export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  openId: varchar("openId", { length: 64 }).notNull(), // 保留但不再使用
  firebaseUid: varchar("firebaseUid", { length: 128 }), // 新增
  email: text("email"),
  name: text("name"),
  role: mysqlEnum("role", ["admin", "user"]).default("user"),
  // ...其他欄位保持不變
});
```

然後執行 `pnpm db:push` 推送 schema 變更。

### 18.6 完整的環境變數

使用 Firebase Authentication 後，你需要的環境變數如下：

```env
# Firebase 前端設定（安全公開，以 VITE_ 開頭讓 Vite 注入前端）
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# Firebase 後端設定（僅在非 Google Cloud 環境中需要）
# 如果部署在 Cloud Run 上，不需要這個變數
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# 其他保留的環境變數
DATABASE_URL=mysql://user:pass@host:3306/dbname
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

> **重要提醒**：`VITE_FIREBASE_API_KEY` 是公開的 API Key，它只是用來識別你的 Firebase 專案，不是私密金鑰。Firebase 的安全性是透過 Security Rules 和後端 Token 驗證來保證的，不是透過隱藏 API Key。

### 18.7 與現有 Google OAuth 的關係

本專案原本已經有一套 Google OAuth 登入（透過 `GoogleAuthContext.tsx` 和 Google Identity Services），主要用於取得 Google Drive 存取權。使用 Firebase Authentication 後，你有兩種整合方式：

**方式 A：完全替換為 Firebase（推薦）**

將 `GoogleAuthContext.tsx` 中的 Google Identity Services 替換為 Firebase 的 `signInWithPopup`。Firebase 的 Google Provider 可以設定額外的 scope（如 Google Drive），登入後可以透過 `user.getIdToken()` 取得 ID Token，透過 `GoogleAuthProvider.credentialFromResult(result)` 取得 Google Access Token。

```typescript
// 在 signInWithPopup 的結果中取得 Google Access Token
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const result = await signInWithPopup(auth, googleProvider);
const credential = GoogleAuthProvider.credentialFromResult(result);
const googleAccessToken = credential?.accessToken;
// 這個 accessToken 可以用於 Google Drive API、Google Sheets API 等
```

**方式 B：並行使用（過渡期）**

保留現有的 `GoogleAuthContext.tsx` 用於 Google Drive 存取，另外加入 Firebase Auth 用於後端認證。這樣可以最小化修改範圍，但長期來看建議統一為方式 A。

### 18.8 安全性注意事項

1. **永遠在後端驗證 Token**：不要信任前端傳來的使用者資訊，必須用 `admin.auth().verifyIdToken()` 在後端驗證
2. **Token 自動刷新**：Firebase ID Token 預設 1 小時過期，`user.getIdToken()` 會自動刷新，不需要手動處理
3. **封鎖保護**：Firebase 內建防止暴力破解的機制，多次失敗後會自動封鎖帳號
4. **網域限制**：在 Firebase Console 中設定「Authorized domains」，只允許你的網域使用認證

---

## 19. 環境變數對照表

本專案使用的環境變數分為三類：**Manus 專屬**（遷移後必須移除）、**通用保留**（遷移後仍需使用，但值要替換）、**新增必要**（遷移後需要自行新增）。以下逐一說明。

### 19.1 Manus 專屬環境變數（遷移後必須移除）

這些變數完全由 Manus 平台自動注入，離開 Manus 後它們不再有任何作用，必須從程式碼中移除所有引用。

| 變數名稱 | Manus 平台用途 | 引用位置 | 移除方式 |
|---------|------------|---------|----------|
| `VITE_APP_ID` | Manus OAuth 應用程式 ID，用於建構 Manus 登入 URL | `server/_core/env.ts`, `client/src/const.ts` | 刪除 `client/src/const.ts` 中的 `getLoginUrl()` 函數，移除 `env.ts` 中的 `appId` 字段 |
| `VITE_OAUTH_PORTAL_URL` | Manus 登入入口頁面 URL（例如 `https://login.manus.im`），前端用來將使用者導向 Manus 登入頁 | `client/src/const.ts` | 刪除 `getLoginUrl()` 中的引用，改用自己的 Google OAuth 登入流程 |
| `OAUTH_SERVER_URL` | Manus OAuth 後端伺服器 URL（例如 `https://api.manus.im`），用於交換 authorization code 取得 token | `server/_core/env.ts`, `server/_core/oauth.ts`, `server/_core/sdk.ts` | 移除整個 `server/_core/oauth.ts` 和 `server/_core/sdk.ts` 中的 Manus OAuth 邏輯 |
| `OWNER_OPEN_ID` | Manus 專案擁有者的 OpenID，用於判斷是否為專案擁有者（admin 權限） | `server/_core/env.ts` | 移除，改用資料庫中的 `users.role` 欄位判斷管理員權限 |
| `OWNER_NAME` | Manus 專案擁有者名稱，用於通知顯示 | 未直接在程式碼中使用 | 無需處理，只需從 `.env` 中移除 |
| `BUILT_IN_FORGE_API_URL` | Manus Forge API 基礎 URL，這是 Manus 平台的統一 API 閘道，包含 LLM、S3 儲存、通知、圖片生成、語音轉文字等多個服務 | `server/_core/env.ts`, `server/storage.ts`, `server/_core/llm.ts`, `server/_core/notification.ts`, `server/_core/imageGeneration.ts`, `server/_core/voiceTranscription.ts`, `server/_core/dataApi.ts` | 移除所有引用，改用各服務自己的 SDK（詳見下方「新增必要」章節） |
| `BUILT_IN_FORGE_API_KEY` | Manus Forge API 的 Bearer Token，用於後端呼叫 Forge API 時的身份驗證 | `server/_core/env.ts`, `server/storage.ts` 等所有使用 Forge API 的模組 | 移除，改用各服務自己的 API Key |
| `VITE_FRONTEND_FORGE_API_KEY` | 前端版本的 Forge API Token，用於前端直接呼叫 Manus API（例如 Google Maps 代理） | `client/src/components/Map.tsx` | 移除，本專案未使用 Maps 功能 |
| `VITE_FRONTEND_FORGE_API_URL` | 前端版本的 Forge API URL | `client/src/components/Map.tsx` | 移除，同上 |
| `VITE_ANALYTICS_ENDPOINT` | Manus 內建的 Umami 分析服務端點 URL，用於追蹤網站流量 | `client/index.html` 中的 `<script>` 標籤 | 移除或替換為自己的 Google Analytics / Umami 實例 |
| `VITE_ANALYTICS_WEBSITE_ID` | Umami 分析服務的網站 ID | `client/index.html` 中的 `<script>` 標籤 | 同上，一起移除或替換 |

### 19.2 通用保留環境變數（遷移後仍需使用，但值要替換）

這些變數的「概念」是通用的，但在 Manus 上的值是由平台自動提供的，遷移後你需要自行設定對應的值。

| 變數名稱 | 用途說明 | 如何取得新值 | 必要性 |
|---------|---------|------------|--------|
| `DATABASE_URL` | MySQL / TiDB 資料庫連線字串。在 Manus 上指向平台內建的 TiDB Serverless 實例。格式為 `mysql://user:password@host:port/database?ssl={"rejectUnauthorized":true}` | 建立自己的 MySQL 8.0+ 或 TiDB Serverless 實例，取得連線字串。推薦：PlanetScale、TiDB Cloud、AWS RDS、Google Cloud SQL | **必要** |
| `JWT_SECRET` | 用於簽署 session cookie 的密鑰。在 Manus 上由平台自動生成。如果這個值洩漏或被替換，所有現有的登入 session 都會失效 | 執行 `openssl rand -base64 32` 生成一個隨機字串，存入環境變數 | **必要** |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID，用於 Google 登入功能。本專案的核心認證是透過 Google OAuth，而不是 Manus OAuth | 到 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 建立 OAuth 2.0 Client ID，設定授權的 redirect URI。目前已有值：`1034922920826-p03210cv43c0kgdp15fjgkq90hbjs6uq.apps.googleusercontent.com`（寫在 `client/src/constants.ts` 中作為 fallback） | **必要** |
| `VITE_APP_TITLE` | 網站標題，顯示在瀏覽器分頁和部分 UI 元件上 | 直接設定為你想要的標題，例如 `CPV Uploader`，或者直接在程式碼中硬編碼 | 選擇性 |
| `VITE_APP_LOGO` | 網站 Logo 圖片 URL | 上傳你的 Logo 到 CDN 或 S3，取得 URL，或者直接在程式碼中硬編碼 | 選擇性 |
| `PORT` | 伺服器監聽的埠口號，預設為 `3000` | 大多數雲端平台會自動注入（Cloud Run 用 `8080`，Railway 自動分配） | 自動 |
| `NODE_ENV` | Node.js 執行環境，`development` 或 `production` | 部署時設定為 `production`，本地開發用 `development` | 自動 |

### 19.3 遷移後需要新增的環境變數

這些變數在 Manus 平台上不存在（因為平台內建了對應服務），但遷移後你需要自行提供。

| 變數名稱 | 用途說明 | 如何取得 | 必要性 |
|---------|---------|---------|--------|
| `S3_BUCKET` | S3 儲存桶名稱，用於儲存上傳的影片和圖片 | 在 AWS S3 或相容服務（Cloudflare R2、MinIO）建立 Bucket | **必要** |
| `S3_REGION` | S3 Bucket 所在區域，例如 `ap-northeast-1` | 建立 Bucket 時選擇的區域 | **必要** |
| `S3_ACCESS_KEY_ID` | AWS IAM Access Key ID，用於 S3 API 認證 | 在 AWS IAM 建立具有 S3 存取權限的使用者，取得 Access Key | **必要** |
| `S3_SECRET_ACCESS_KEY` | AWS IAM Secret Access Key | 同上，與 Access Key ID 一起取得 | **必要** |
| `S3_ENDPOINT` | S3 相容服務的端點 URL（僅非 AWS S3 時需要） | 例如 Cloudflare R2: `https://<account_id>.r2.cloudflarestorage.com` | 條件性 |
| `S3_PUBLIC_URL` | S3 Bucket 的公開存取 URL 前綴，用於產生檔案的公開連結 | 例如 `https://your-bucket.s3.amazonaws.com` 或自訂 CDN 網域 | **必要** |

### 19.4 完整的 `.env.example` 範例

遷移後，你的 `.env` 檔案應該長這樣（已移除所有 Manus 專屬變數）：

```env
# ==================== 資料庫 ====================
# MySQL 8.0+ 或 TiDB Serverless 連線字串
# 格式: mysql://user:password@host:port/database?ssl={"rejectUnauthorized":true}
DATABASE_URL=mysql://root:your_password@localhost:3306/cpv_uploader

# ==================== 認證 ====================
# Session cookie 簽名密鑰（用 openssl rand -base64 32 生成）
JWT_SECRET=your_random_secret_here

# Google OAuth 2.0 Client ID
# 從 https://console.cloud.google.com/apis/credentials 取得
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

# ==================== S3 儲存 ====================
# 用於儲存上傳的影片和圖片
S3_BUCKET=your-bucket-name
S3_REGION=ap-northeast-1
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
# 僅非 AWS S3 時需要（例如 Cloudflare R2、MinIO）
# S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
# 公開存取 URL 前綴
S3_PUBLIC_URL=https://your-bucket.s3.amazonaws.com

# ==================== 應用程式設定（選擇性） ====================
VITE_APP_TITLE=CPV Uploader
# VITE_APP_LOGO=https://your-cdn.com/logo.png

# ==================== 分析追蹤（選擇性） ====================
# 如果你想使用 Google Analytics 或自架 Umami
# GA_TRACKING_ID=G-XXXXXXXXXX
```

> **重要提醒**：在 Manus 平台上，`BUILT_IN_FORGE_API_URL` 和 `BUILT_IN_FORGE_API_KEY` 是一個「萬用閘道」，它背後包含了 S3 儲存、LLM、通知、圖片生成、語音轉文字、Google Maps 代理等多個服務。遷移後，你只需要替換本專案實際使用的服務（主要是 S3 儲存），其他未使用的服務直接刪除即可。

---

## 20. 檔案處理清單

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

## 21. 資料庫結構說明

本專案使用 **Drizzle ORM** 搭配 **MySQL**（在 Manus 平台上實際使用的是 TiDB Serverless，完全相容 MySQL 8.0 協定）。資料庫 schema 定義在 `drizzle/schema.ts`，以下是所有 6 張表格的完整結構說明。遷移時只需將同一個 schema 推送到你的新資料庫即可（`pnpm db:push`）。

### 21.1 表格總覽

| 表格名稱 | Drizzle 變數名 | 用途說明 | 記錄數量級別 |
|---------|------------|---------|------------|
| `users` | `users` | 使用者帳號（Manus OAuth 登入紀錄） | 百級 |
| `companies` | `companies` | 公司（包含 Facebook Access Token 和目錄設定） | 十級 |
| `company_members` | `companyMembers` | 公司成員（郁請制，透過 email 配對） | 十級 |
| `upload_records` | `uploadRecords` | 影片上傳紀錄（核心業務資料） | 萬級 |
| `app_settings` | `appSettings` | 應用程式設定（Key-Value 儲存） | 個位數 |
| `slideshow_templates` | `slideshowTemplates` | 幻燈片範本設定 | 十級 |

### 21.2 `users` 表 — 使用者帳號

這張表是 Manus OAuth 登入系統的核心。**遷移注意**：`openId` 欄位儲存的是 Manus 平台的使用者 ID，如果你移除 Manus OAuth 並改用 Google OAuth，可以將此欄位改為儲存 Google `sub` ID，或者新增一個 `googleId` 欄位。

```sql
CREATE TABLE `users` (
  `id`            int          NOT NULL AUTO_INCREMENT,
  `openId`        varchar(64)  NOT NULL,          -- Manus OAuth 識別碼（遷移後可改為 Google sub ID）
  `name`          text         DEFAULT NULL,       -- 使用者名稱
  `email`         varchar(320) DEFAULT NULL,       -- 使用者 email
  `loginMethod`   varchar(64)  DEFAULT NULL,       -- 登入方式（例如 'google'）
  `role`          enum('user','admin') NOT NULL DEFAULT 'user',  -- 角色權限
  `createdAt`     timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_openId_unique` (`openId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `id` | int AUTO_INCREMENT | ✔ | 自動遞增 | 主鍵 |
| `openId` | varchar(64) | ✔ | — | Manus OAuth 識別碼，UNIQUE。遷移後可改存 Google `sub` ID |
| `name` | text | ✘ | NULL | 使用者名稱 |
| `email` | varchar(320) | ✘ | NULL | 使用者 email |
| `loginMethod` | varchar(64) | ✘ | NULL | 登入方式識別碼 |
| `role` | enum('user','admin') | ✔ | 'user' | 角色權限，用於區分管理員和一般使用者 |
| `createdAt` | timestamp | ✔ | CURRENT_TIMESTAMP | 建立時間 |
| `updatedAt` | timestamp | ✔ | CURRENT_TIMESTAMP ON UPDATE | 更新時間（自動更新） |
| `lastSignedIn` | timestamp | ✔ | CURRENT_TIMESTAMP | 最後登入時間 |

### 21.3 `companies` 表 — 公司設定

每個公司擁有自己的 Facebook Access Token 和目錄清單。`catalogs` 欄位儲存 JSON 陣列字串，格式為 `[{"id":"123","name":"My Catalog"}]`。

```sql
CREATE TABLE `companies` (
  `id`                   int          NOT NULL AUTO_INCREMENT,
  `name`                 varchar(255) NOT NULL,           -- 公司名稱
  `facebookAccessToken`  text         DEFAULT NULL,       -- Facebook Graph API Access Token
  `catalogs`             text         DEFAULT NULL,       -- JSON 陣列: [{id, name}]
  `accessKey`            varchar(255) DEFAULT NULL,       -- 上傳工具存取密碼
  `tokenExpiresAt`       timestamp    NULL DEFAULT NULL,  -- Token 過期時間
  `createdBy`            int          NOT NULL,           -- 建立者 user ID
  `createdAt`            timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`            timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | int AUTO_INCREMENT | ✔ | 主鍵 |
| `name` | varchar(255) | ✔ | 公司名稱 |
| `facebookAccessToken` | text | ✘ | Facebook Graph API 存取權杖，用於讀取目錄商品和上傳影片 |
| `catalogs` | text | ✘ | JSON 字串，儲存公司繫定的 Meta 目錄清單 `[{"id":"...","name":"..."}]` |
| `accessKey` | varchar(255) | ✘ | 公司內部存取密碼，用於上傳工具的認證 |
| `tokenExpiresAt` | timestamp | ✘ | Facebook Token 過期時間，用於前端顯示過期提醒 |
| `createdBy` | int | ✔ | 建立此公司的使用者 ID（對應 `users.id`） |
| `createdAt` | timestamp | ✔ | 建立時間 |
| `updatedAt` | timestamp | ✔ | 更新時間 |

### 21.4 `company_members` 表 — 公司成員

透過 email 邀請制管理公司成員。新成員加入時狀態為 `pending`，當該 email 的使用者實際登入後會自動配對並轉為 `active`。

```sql
CREATE TABLE `company_members` (
  `id`          int          NOT NULL AUTO_INCREMENT,
  `companyId`   int          NOT NULL,                    -- 所屬公司 ID
  `email`       varchar(320) NOT NULL,                    -- 成員 email
  `memberRole`  enum('owner','member') NOT NULL DEFAULT 'member',  -- 公司內角色
  `status`      enum('active','pending') NOT NULL DEFAULT 'pending', -- 成員狀態
  `userId`      int          DEFAULT NULL,                -- 已配對的 user ID
  `createdAt`   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | int AUTO_INCREMENT | ✔ | 主鍵 |
| `companyId` | int | ✔ | 外鍵，對應 `companies.id` |
| `email` | varchar(320) | ✔ | 成員 email，用於邀請配對 |
| `memberRole` | enum('owner','member') | ✔ | 公司內角色：owner 可管理設定，member 只能上傳 |
| `status` | enum('active','pending') | ✔ | pending = 已邀請但未登入，active = 已配對使用者 |
| `userId` | int | ✘ | 當成員登入後自動填入對應的 `users.id` |
| `createdAt` | timestamp | ✔ | 建立時間 |
| `updatedAt` | timestamp | ✔ | 更新時間 |

### 21.5 `upload_records` 表 — 影片上傳紀錄（核心業務資料）

這是本專案最重要的表格，記錄每次影片上傳的詳細資訊。每個商品可能有多筆上傳紀錄（重複上傳），但前端 Video Log 會以 `retailerId + catalogId` 去重，只顯示最新一筆。

```sql
CREATE TABLE `upload_records` (
  `id`                int          NOT NULL AUTO_INCREMENT,
  `companyId`         int          DEFAULT NULL,          -- 所屬公司 ID
  `catalogId`         varchar(64)  NOT NULL,              -- Meta Catalog ID
  `retailerId`        varchar(255) NOT NULL,              -- 商品零售商 ID
  `productName`       varchar(512) NOT NULL,              -- 商品名稱
  `productImageUrl`   text         DEFAULT NULL,          -- 商品圖片 URL
  `video4x5Download`  text         DEFAULT NULL,          -- 4:5 影片下載 URL
  `video4x5Embed`     text         DEFAULT NULL,          -- 4:5 影片嵌入 URL
  `video9x16Download` text         DEFAULT NULL,          -- 9:16 影片下載 URL
  `video9x16Embed`    text         DEFAULT NULL,          -- 9:16 影片嵌入 URL
  `clientName`        varchar(255) NOT NULL,              -- 客戶名稱
  `uploadTimestamp`   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 上傳時間
  `uploadedBy`        varchar(255) DEFAULT NULL,          -- 上傳人員 email（Google 登入）
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | int AUTO_INCREMENT | ✔ | 主鍵 |
| `companyId` | int | ✘ | 外鍵，對應 `companies.id`（可為 NULL 代表未繫定公司） |
| `catalogId` | varchar(64) | ✔ | Meta 目錄 ID，例如 `778284289334909` |
| `retailerId` | varchar(255) | ✔ | 商品零售商 ID，用於商品唯一識別 |
| `productName` | varchar(512) | ✔ | 商品名稱 |
| `productImageUrl` | text | ✘ | 商品圖片 URL（來自 Meta Catalog） |
| `video4x5Download` | text | ✘ | 4:5 比例影片的下載 URL（存在 S3 或 Google Drive） |
| `video4x5Embed` | text | ✘ | 4:5 比例影片的嵌入播放 URL |
| `video9x16Download` | text | ✘ | 9:16 比例影片的下載 URL |
| `video9x16Embed` | text | ✘ | 9:16 比例影片的嵌入播放 URL |
| `clientName` | varchar(255) | ✔ | 客戶名稱（例如 "momo test catalog"） |
| `uploadTimestamp` | timestamp | ✔ | 上傳時間，自動設定為當前時間 |
| `uploadedBy` | varchar(255) | ✘ | 上傳人員的 Google email（例如 `william@gmail.com`） |

> **業務邏輯說明**：`retailerId + catalogId` 組合可以唯一識別一個商品。同一商品可能被多次上傳（更新影片），後端查詢時會以 `MAX(id)` 去重，只返回每個商品的最新紀錄。

### 21.6 `app_settings` 表 — 應用程式設定

簡單的 Key-Value 儲存，用於儲存全域設定（例如預設客戶名稱、功能開關等）。

```sql
CREATE TABLE `app_settings` (
  `id`           int          NOT NULL AUTO_INCREMENT,
  `settingKey`   varchar(128) NOT NULL,              -- 設定鍵名
  `settingValue` text         DEFAULT NULL,          -- 設定值
  `updatedAt`    timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `app_settings_settingKey_unique` (`settingKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `id` | int AUTO_INCREMENT | ✔ | 主鍵 |
| `settingKey` | varchar(128) | ✔ | 設定鍵名，UNIQUE（例如 `default_client_name`） |
| `settingValue` | text | ✘ | 設定值（字串格式） |
| `updatedAt` | timestamp | ✔ | 更新時間 |

### 21.7 `slideshow_templates` 表 — 幻燈片範本

儲存幻燈片生成器的範本設定，包含影片比例、轉場效果、字型、顏色等參數。

```sql
CREATE TABLE `slideshow_templates` (
  `id`                 int          NOT NULL AUTO_INCREMENT,
  `name`               varchar(255) NOT NULL,              -- 範本名稱
  `aspectRatio`        varchar(10)  NOT NULL DEFAULT '4:5', -- 影片比例: '4:5' 或 '9:16'
  `durationPerImage`   int          NOT NULL DEFAULT 3,     -- 每張圖片顯示秒數
  `transition`         varchar(50)  NOT NULL DEFAULT 'fade',-- 轉場效果類型
  `transitionDuration` int          NOT NULL DEFAULT 50,    -- 轉場時長（除以 100 得秒數）
  `showProductName`    int          NOT NULL DEFAULT 0,     -- 是否顯示商品名稱 (0/1)
  `textPosition`       varchar(20)  NOT NULL DEFAULT 'bottom', -- 文字位置: top/center/bottom
  `fontSize`           int          NOT NULL DEFAULT 40,    -- 字型大小 (px)
  `fontFamily`         varchar(100) NOT NULL DEFAULT 'noto-sans-cjk', -- 字型
  `fontColor`          varchar(20)  NOT NULL DEFAULT '#FFFFFF',       -- 字型顏色
  `backgroundColor`    varchar(20)  NOT NULL DEFAULT '#FFFFFF',       -- 背景色
  `imageScale`         int          NOT NULL DEFAULT 100,   -- 圖片縮放比例 (%)
  `imageOffsetX`       int          NOT NULL DEFAULT 0,     -- 圖片水平偏移 (%)
  `imageOffsetY`       int          NOT NULL DEFAULT 0,     -- 圖片垂直偏移 (%)
  `overlayText`        text         DEFAULT NULL,           -- 覆蓋文字
  `createdBy`          int          NOT NULL,               -- 建立者 user ID
  `createdAt`          timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`          timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `id` | int AUTO_INCREMENT | ✔ | 自動遞增 | 主鍵 |
| `name` | varchar(255) | ✔ | — | 範本名稱 |
| `aspectRatio` | varchar(10) | ✔ | '4:5' | 影片比例 |
| `durationPerImage` | int | ✔ | 3 | 每張圖片顯示秒數 |
| `transition` | varchar(50) | ✔ | 'fade' | 轉場效果（fade/slide/zoom 等） |
| `transitionDuration` | int | ✔ | 50 | 轉場時長，實際秒數 = 值 / 100（即 0.5 秒） |
| `showProductName` | int | ✔ | 0 | 是否在影片中顯示商品名稱（0=否, 1=是） |
| `textPosition` | varchar(20) | ✔ | 'bottom' | 文字位置 |
| `fontSize` | int | ✔ | 40 | 字型大小 (px) |
| `fontFamily` | varchar(100) | ✔ | 'noto-sans-cjk' | 字型名稱 |
| `fontColor` | varchar(20) | ✔ | '#FFFFFF' | 字型顏色 (hex) |
| `backgroundColor` | varchar(20) | ✔ | '#FFFFFF' | 背景顏色 (hex) |
| `imageScale` | int | ✔ | 100 | 圖片縮放比例 (%) |
| `imageOffsetX` | int | ✔ | 0 | 圖片水平偏移 (%) |
| `imageOffsetY` | int | ✔ | 0 | 圖片垂直偏移 (%) |
| `overlayText` | text | ✘ | NULL | 覆蓋在影片上的文字 |
| `createdBy` | int | ✔ | — | 建立者 user ID（對應 `users.id`） |
| `createdAt` | timestamp | ✔ | CURRENT_TIMESTAMP | 建立時間 |
| `updatedAt` | timestamp | ✔ | CURRENT_TIMESTAMP ON UPDATE | 更新時間 |

### 21.8 表格關聯關係圖

本專案的資料庫沒有使用 Drizzle 的 `relations` 功能（`drizzle/relations.ts` 為空），也沒有定義 SQL 層級的外鍵約束。以下是邏輯上的關聯關係（透過程式碼中的查詢推斷）：

```
users.id ←── companies.createdBy        (誰建立了這個公司)
users.id ←── company_members.userId     (成員配對到哪個使用者)
users.id ←── slideshow_templates.createdBy (誰建立了這個範本)
companies.id ←── company_members.companyId  (成員屬於哪個公司)
companies.id ←── upload_records.companyId   (上傳紀錄屬於哪個公司)
```

> **遷移提醒**：如果你想在新資料庫中加入外鍵約束以確保資料完整性，可以在 `drizzle/schema.ts` 中使用 `.references(() => users.id)` 等語法加入，然後執行 `pnpm db:push` 推送到資料庫。

### 21.9 資料庫遷移步驟

將資料庫從 Manus 平台遷移到新環境的完整步驟：

1. **建立新的 MySQL 實例**：推薦使用 TiDB Cloud Serverless（免費額度）、PlanetScale、AWS RDS 或 Google Cloud SQL。確保版本為 MySQL 8.0+。

2. **設定連線字串**：將新的 `DATABASE_URL` 寫入 `.env` 檔案。如果使用 TiDB Cloud，連線字串格式為：
   ```
   mysql://user:password@gateway.tidbcloud.com:4000/database?ssl={"rejectUnauthorized":true}
   ```

3. **推送 schema**：執行以下指令建立所有表格：
   ```bash
   pnpm db:push
   ```
   這會執行 `drizzle-kit generate && drizzle-kit migrate`，自動建立所有 6 張表格。

4. **匯出舊資料（如果需要）**：如果你需要保留 Manus 上的現有資料，可以透過 Manus 的 Database UI 匯出 CSV，或者使用 `mysqldump` 工具。

5. **驗證連線**：啟動應用程式後，檢查管理面板的 Video Log 是否能正常顯示資料。

---

## 22. 部署到其他平台

### 22.1 Google Cloud Run

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
