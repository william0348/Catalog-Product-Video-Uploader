# Skill: Migrate Manus-built App for Production Deployment

Manus apps use a specific stack (React + Express + tRPC + Drizzle + MySQL) with OAuth/JWT/Vite dev dependencies that break production Docker builds. This skill documents all required modifications.

## Trigger
When the user mentions "migrate from manus", "manus app", "deploy manus project", or has a repo with Manus-specific code (oauth.ts, sdk.ts, vite.ts in server/_core/).

## How to Identify a Manus App
Look for these telltale signs:
- `server/_core/oauth.ts` — Manus OAuth flow
- `server/_core/sdk.ts` — Manus SDK with `OAuthService`, `SDKServer`
- `server/_core/vite.ts` — Vite dev server setup imported at runtime
- `vite-plugin-manus-runtime` in devDependencies
- `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` env vars
- `@shared/const` with `COOKIE_NAME`
- File timestamps from 1979 (epoch 0)

## Checklist: What to Fix

### 1. Remove Vite Dev Dependency (CRITICAL)
**Why**: esbuild bundles with `--packages=external`, so `import from "vite"` becomes a runtime dependency that doesn't exist in production `node_modules`.

**File**: `server/_core/index.ts`

Remove:
```typescript
import { serveStatic, setupVite } from "./vite";
```

Replace the if/else block:
```typescript
// REMOVE:
if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);
}

// REPLACE WITH:
import fs from "fs";
import path from "path";
const distPath = path.resolve(import.meta.dirname, "public");
if (!fs.existsSync(distPath)) {
  console.error(`Could not find the build directory: ${distPath}`);
}
app.use(express.static(distPath));
app.use("*", (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});
```

**Key insight**: Even dynamic `import("./vite")` inside an `if (dev)` block gets bundled by esbuild. The only safe approach is to completely remove any reference to vite.ts.

### 2. Remove Manus OAuth (if not needed)
**File**: `server/_core/index.ts`

Remove:
```typescript
import { registerOAuthRoutes } from "./oauth";
registerOAuthRoutes(app);
```

**File**: `server/_core/env.ts`

Remove Manus-only env vars:
```typescript
// REMOVE these:
appId: process.env.VITE_APP_ID ?? "",
cookieSecret: process.env.JWT_SECRET ?? "",
oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
```

**Note**: The tRPC context (`server/_core/context.ts`) still imports `sdk` for auth. If you remove OAuth entirely, the `sdk.authenticateRequest()` will always fail silently (returns `user: null`). This is fine if all your routes are `publicProcedure`. If you have `protectedProcedure` routes, they will return 401.

### 3. Remove Frontend Auth Gate (CRITICAL)
**Why**: `DashboardLayout.tsx` uses `useAuth()` which calls `trpc.auth.me`. Without Manus OAuth, user is always `null`, so the app shows "Sign in to continue" forever.

**File**: `client/src/components/DashboardLayout.tsx`

Remove the login gate:
```typescript
// REMOVE this entire block:
if (loading) {
  return <DashboardLayoutSkeleton />
}
if (!user) {
  return ( /* Sign in screen */ );
}
```

**File**: `server/_core/context.ts`

Replace Manus SDK auth with a default user:
```typescript
// REMOVE:
import { sdk } from "./sdk";
user = await sdk.authenticateRequest(opts.req);

// REPLACE WITH: auto-create a default admin user
const DEFAULT_OPEN_ID = "cloudrun-default-user";
async function getOrCreateDefaultUser() {
  let user = await getUserByOpenId(DEFAULT_OPEN_ID);
  if (!user) {
    await upsertUser({ openId: DEFAULT_OPEN_ID, name: "Admin", email: "admin@localhost", role: "admin", lastSignedIn: new Date() });
    user = await getUserByOpenId(DEFAULT_OPEN_ID);
  }
  return user;
}
```

This ensures all `protectedProcedure` and `adminProcedure` routes work without Manus OAuth.

### 4. Fix Frontend OAuth URL Crash (CRITICAL)
**Why**: `client/src/const.ts` has `getLoginUrl()` that calls `new URL(undefined/app-auth)` when `VITE_OAUTH_PORTAL_URL` is not set. This crashes the entire React app on load.

**File**: `client/src/const.ts`

Add a guard:
```typescript
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  // Skip OAuth URL generation when not configured
  if (!oauthPortalUrl || !appId) {
    return "#";
  }
  // ... rest of function
};
```

**Also check**: `client/src/main.tsx` — the `redirectToLoginIfUnauthorized` function calls `getLoginUrl()` on every tRPC error. With the guard above, it will redirect to `#` instead of crashing.

### 4. Remove Umami Analytics Script (CRITICAL)
**Why**: `client/index.html` contains `<script src="%VITE_ANALYTICS_ENDPOINT%/umami">` which is a Manus analytics script. The `%VITE_*%` syntax only gets replaced during Vite build if the env var is set. Without it, the literal string becomes the URL, causing `URIError: Failed to decode param` on every page load.

**File**: `client/index.html`

Remove:
```html
<script defer src="%VITE_ANALYTICS_ENDPOINT%/umami" data-website-id="%VITE_ANALYTICS_WEBSITE_ID%"></script>
```

### 5. Fix COOP Header for Google OAuth
**Why**: `Cross-Origin-Opener-Policy: same-origin` blocks Google Identity Services popup from communicating the token back to the app window.

**File**: `server/_core/index.ts`

```typescript
// FROM:
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
// TO:
res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
```

### 6. Fix File Timestamps
**Why**: Manus exports have timestamps from 1979 which break `gcloud builds submit` (ZIP format doesn't support pre-1980 dates).

```bash
find . -not -path './.git/*' -exec touch -t $(date +%Y%m%d%H%M) {} +
```

### 7. DATABASE_URL Format for Cloud SQL
**Why**: mysql2 expects `socketPath` not `socket` for Unix socket connections.

```
# WRONG:
mysql://user:pass@localhost/db?socket=/cloudsql/CONNECTION

# CORRECT:
mysql://user:pass@localhost/db?socketPath=/cloudsql/CONNECTION
```

### 8. Use URL-safe DB Passwords
**Why**: `openssl rand -base64 16` generates passwords with `/`, `+`, `=` which break `new URL()` parsing in the migration script and drizzle.

**Fix**: Use hex instead:
```bash
DB_PASS=$(openssl rand -hex 16)
```

### 9. Database Migrations
Manus apps use Drizzle ORM. Migration SQL files are in `drizzle/`. For production:
- Create a `run-migrations.js` that runs all SQL with `CREATE TABLE IF NOT EXISTS`
- Add it to Dockerfile CMD: `CMD ["sh", "-c", "node run-migrations.js && node dist/index.js"]`
- Handle `ER_DUP_FIELDNAME` and `ER_TABLE_EXISTS_ERROR` gracefully (skip if already exists)

### 10. Google OAuth Client Configuration
After deploying, add the production URL to Google Cloud Console:
- **Authorized JavaScript origins**: `https://YOUR-SERVICE-URL`
- **Authorized redirect URIs**: `https://YOUR-SERVICE-URL`

Find the OAuth Client ID in `client/src/constants.ts` → `GOOGLE_CLIENT_ID`.

## Files You Can Safely Ignore/Delete
These are Manus-specific and not needed for production:
- `server/_core/oauth.ts` — Manus OAuth callback handler
- `server/_core/sdk.ts` — Manus SDK (only if you fully remove auth)
- `server/_core/types/manusTypes.ts` — Manus OAuth types
- `.env.example` entries for `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `VITE_APP_ID`, `JWT_SECRET`

## Files You Must Keep
- `server/_core/context.ts` — tRPC context (still needed, auth fails gracefully)
- `server/_core/cookies.ts` — cookie config (may be used elsewhere)
- `server/_core/trpc.ts` — tRPC router/procedure definitions
- `drizzle/schema.ts` — database schema
- `shared/` — shared constants and types used by both client and server
