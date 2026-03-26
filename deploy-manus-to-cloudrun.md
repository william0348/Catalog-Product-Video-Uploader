# Skill: Deploy Manus-built App to Google Cloud Run

Manus apps use a specific stack (React + Express + tRPC + Drizzle + MySQL) with OAuth/JWT/Vite dev dependencies that break production Docker builds. This skill documents all required modifications and deployment steps.

---

## Step 1: Remove Manus OAuth Code

### `server/_core/env.ts`
Remove these env vars:
```diff
- appId: process.env.VITE_APP_ID ?? "",
- cookieSecret: process.env.JWT_SECRET ?? "",
- oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
- ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
```

### `server/_core/index.ts`
Remove OAuth import and route registration:
```diff
- import { registerOAuthRoutes } from "./oauth";
- import { serveStatic, setupVite } from "./vite";
+ // No vite import — inline serveStatic for production
```

Remove:
```diff
- registerOAuthRoutes(app);
```

### `.env.example`
Remove OAuth-related env vars:
```diff
- OAUTH_SERVER_URL=...
- OWNER_OPEN_ID=...
- VITE_APP_ID=...
- JWT_SECRET=...
```

---

## Step 2: Fix Vite Dev Dependency Issue

**Problem**: esbuild bundles with `--packages=external`, so any `import from "vite"` or `import from "@builder.io/vite-plugin-jsx-loc"` etc. becomes a runtime dependency. These are devDependencies not present in the production image.

### `server/_core/index.ts`
Replace the static vite import + if/else with inlined production-only static serving:

```typescript
import fs from "fs";
import path from "path";

// Replace this:
// import { serveStatic, setupVite } from "./vite";
// if (process.env.NODE_ENV === "development") {
//   await setupVite(app, server);
// } else {
//   serveStatic(app);
// }

// With this (production only):
const distPath = path.resolve(import.meta.dirname, "public");
if (!fs.existsSync(distPath)) {
  console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
}
app.use(express.static(distPath));
app.use("*", (_req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});
```

**Key insight**: Even dynamic `import("./vite")` inside an `if (dev)` block gets bundled by esbuild. The only safe approach is to completely remove any reference to vite.ts from the production code path.

---

## Step 3: Create Dockerfile

```dockerfile
# ── Stage 1: Build ──
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── Stage 2: Production ──
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "dist/index.js"]
```

---

## Step 4: Create cloudbuild.yaml

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'asia-east1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/APP_NAME:latest'
      - '-f'
      - 'Dockerfile'
      - '.'
images:
  - 'asia-east1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/APP_NAME:latest'
```

---

## Step 5: Create .dockerignore

```
node_modules
dist
.git
*.md
*.txt
.env
.env.*
```

---

## Step 6: Fix Timestamps

Manus exports have timestamps from 1979 which break `gcloud builds submit` (ZIP format doesn't support pre-1980 dates):

```bash
find /path/to/app -exec touch -t $(date +%Y%m%d%H%M) {} +
```

---

## Step 7: Enable GCP APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sql-component.googleapis.com
```

---

## Step 8: Create Cloud SQL (first time only)

```bash
# Create instance
gcloud sql instances create APP-mysql \
  --database-version=MYSQL_8_0 \
  --tier=db-f1-micro \
  --region=asia-east1 \
  --root-password="$(openssl rand -base64 16)" \
  --storage-size=10GB

# Create database
gcloud sql databases create APP_db --instance=APP-mysql

# Create user
DB_PASS=$(openssl rand -base64 16)
gcloud sql users create appuser --instance=APP-mysql --password="$DB_PASS"
```

---

## Step 9: Build & Deploy

```bash
# Build image
cd /path/to/app
gcloud builds submit --config=cloudbuild.yaml .

# Get Cloud SQL connection name
CONNECTION_NAME=$(gcloud sql instances describe APP-mysql --format='value(connectionName)')

# Deploy to Cloud Run
gcloud run deploy APP_NAME \
  --image asia-east1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/APP_NAME:latest \
  --region asia-east1 \
  --port 3000 \
  --allow-unauthenticated \
  --add-cloudsql-instances="$CONNECTION_NAME" \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=mysql://appuser:DB_PASS@localhost/APP_db?socket=/cloudsql/$CONNECTION_NAME" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3
```

---

## Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `ERR_MODULE_NOT_FOUND: vite` | esbuild keeps vite as external import | Remove all vite references from production code |
| `ERR_MODULE_NOT_FOUND: @builder.io/vite-plugin-jsx-loc` | vite.config.ts imports dev plugins | Same — don't import vite.ts at all |
| `ZIP does not support timestamps before 1980` | Manus exports use epoch 0 timestamps | `touch` all files to current date |
| `Container failed to start on port 3000` | Check logs for actual error | `gcloud run services logs read APP --region=REGION` |
| `--source` picks wrong Dockerfile | Stale Cloud Build cache | Use `cloudbuild.yaml` with explicit `--config` |
| `Cannot connect to Cloud SQL from local` | Sandbox blocks outbound MySQL | Use Cloud Run Jobs or Cloud SQL proxy |
