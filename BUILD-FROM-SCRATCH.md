# CPV Video Uploader — Build From Scratch Guide

> **Audience**: Human engineers and AI vibe-coding tools (Cursor, Windsurf, Bolt, v0, etc.)
> **Purpose**: Reproduce the entire CPV Video Uploader from zero, understanding every business decision and technical detail along the way.
> **Last Updated**: April 2026

---

## Table of Contents

1. [What This Tool Does (Business Context)](#1-what-this-tool-does-business-context)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Tech Stack and Why Each Piece Was Chosen](#3-tech-stack-and-why-each-piece-was-chosen)
4. [Prerequisites and Environment Setup](#4-prerequisites-and-environment-setup)
5. [Phase 1 — Project Scaffolding](#5-phase-1--project-scaffolding)
6. [Phase 2 — Database Schema Design](#6-phase-2--database-schema-design)
7. [Phase 3 — Google OAuth Login](#7-phase-3--google-oauth-login)
8. [Phase 4 — Facebook Graph API Integration](#8-phase-4--facebook-graph-api-integration)
9. [Phase 5 — Product Table and Catalog Browser](#9-phase-5--product-table-and-catalog-browser)
10. [Phase 6 — Video Upload Pipeline](#10-phase-6--video-upload-pipeline)
11. [Phase 7 — Google Drive Integration](#11-phase-7--google-drive-integration)
12. [Phase 8 — Multi-Company Architecture](#12-phase-8--multi-company-architecture)
13. [Phase 9 — Admin Panel and Video Log](#13-phase-9--admin-panel-and-video-log)
14. [Phase 10 — Internationalization (i18n)](#14-phase-10--internationalization-i18n)
15. [Phase 11 — XLSX Import/Export](#15-phase-11--xlsx-importexport)
16. [Phase 12 — Security, Error Handling, and Polish](#16-phase-12--security-error-handling-and-polish)
17. [Phase 13 — Deployment](#17-phase-13--deployment)
18. [Complete File Tree](#18-complete-file-tree)
19. [Environment Variables Reference](#19-environment-variables-reference)
20. [Common Pitfalls and Troubleshooting](#20-common-pitfalls-and-troubleshooting)

---

## 1. What This Tool Does (Business Context)

### The Problem

E-commerce brands that sell on Meta (Facebook/Instagram) need to attach product videos to their **Facebook Product Catalogs**. Without automation, a marketing team member must manually navigate to Commerce Manager, find each product by its Retailer ID, upload a video file, and wait for processing — roughly **15 minutes per product**. For a catalog with 500 products, that is 125 hours of manual labor.

### The Solution

CPV Video Uploader is an internal tool that lets marketing teams:

1. **Authenticate** with Google to access their Google Drive videos.
2. **Browse** a Facebook Product Catalog by connecting a Meta Access Token.
3. **Select products** from the catalog table, then drag-and-drop or pick videos from Google Drive.
4. **Upload videos** directly to Meta's Graph API — one product at a time or in bulk.
5. **Track** every upload in a centralized admin panel with filtering, search, and XLSX export.

The tool reduces per-product upload time from **15 minutes to under 10 seconds** — a **90x improvement**.

### Who Uses It

| Role | What They Do |
|------|-------------|
| Marketing Coordinator | Selects products, picks videos from Drive, clicks upload |
| Marketing Manager | Reviews upload logs in admin panel, exports reports |
| Engineering / IT Admin | Manages companies, access tokens, and user permissions |

### Key Business Rules

- Each company has its own **Facebook Access Token** and set of **catalogs**.
- Team members are invited by email and can only access their company's catalogs.
- Videos come from two sources: **Google Drive** (shared team folders) or **local file upload**.
- The tool supports two video aspect ratios: **4:5** (feed) and **9:16** (Reels/Stories), plus additional custom ratios.
- All uploads are logged with the uploader's Google email, timestamp, and video links.
- The admin panel deduplicates records — if the same product (same `retailerId` + `catalogId`) is uploaded multiple times, only the latest record is shown.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  MainApp │  │  Admin   │  │  Terms   │  │   HomePage    │   │
│  │  (Upload │  │  Panel   │  │  of      │  │   (Landing)   │   │
│  │   Tool)  │  │  (Logs)  │  │  Service │  │              │   │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────────┘   │
│       │              │                                          │
│  ┌────┴──────────────┴──────────────────────────────────────┐  │
│  │              tRPC Client (type-safe RPC)                  │  │
│  └────┬─────────────────────────────────────────────────────┘  │
│       │                                                         │
│  ┌────┴──────────────────────────────────────────────────────┐  │
│  │  Google OAuth   │  Google Drive API  │  Google Picker API │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS (JSON-RPC)
┌─────────────────────────┴───────────────────────────────────────┐
│                      SERVER (Express + tRPC)                     │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Company  │  │ Upload   │  │ Facebook │  │  Settings    │    │
│  │ Router   │  │ Router   │  │ Router   │  │  Router      │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘    │
│       │              │              │                             │
│  ┌────┴──────────────┴──────────────┴────────────────────────┐  │
│  │              Drizzle ORM (Query Helpers)                    │  │
│  └────┬──────────────────────────────────────────────────────┘  │
│       │                                                          │
└───────┼──────────────────────────────────────────────────────────┘
        │
┌───────┴──────┐    ┌──────────────────┐    ┌──────────────────┐
│   MySQL /    │    │  Facebook Graph   │    │   AWS S3         │
│   TiDB       │    │  API v21.0        │    │   (File Storage) │
│   Database   │    │                    │    │                  │
└──────────────┘    └──────────────────┘    └──────────────────┘
```

The architecture follows a **full-stack TypeScript monorepo** pattern. The client and server share types through tRPC, eliminating the need for separate API contracts or code generation.

---

## 3. Tech Stack and Why Each Piece Was Chosen

| Layer | Technology | Why This Choice |
|-------|-----------|-----------------|
| **Frontend Framework** | React 19 + TypeScript | Industry standard, massive ecosystem, strong typing |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Utility-first CSS with pre-built accessible components |
| **Routing** | Wouter (+ hash-based routing) | Lightweight alternative to React Router, sufficient for internal tools |
| **API Layer** | tRPC 11 | End-to-end type safety — change a server procedure, get instant TypeScript errors in the client |
| **Server** | Express 4 | Battle-tested Node.js server, easy middleware integration |
| **ORM** | Drizzle ORM | Type-safe SQL queries, lightweight, excellent MySQL support |
| **Database** | MySQL (TiDB compatible) | Relational data with strong consistency, easy to host anywhere |
| **File Storage** | AWS S3 (or compatible) | Scalable object storage for uploaded videos and images |
| **Auth** | Google OAuth 2.0 (via GIS) | Users already have Google accounts; provides access to Google Drive |
| **External API** | Facebook Graph API v21.0 | Required for reading catalogs and uploading product videos |
| **Build Tool** | Vite 6 | Fast HMR in development, optimized production builds |
| **Testing** | Vitest | Fast, Vite-native test runner with excellent TypeScript support |
| **i18n** | Custom lightweight solution | Simple key-value translation system (EN + ZH-TW) |

---

## 4. Prerequisites and Environment Setup

### Required Accounts and Credentials

Before writing any code, you need to set up the following external services. This table lists every credential the application requires.

| Service | What You Need | How to Get It |
|---------|--------------|---------------|
| **Google Cloud Console** | OAuth 2.0 Client ID | Create a project → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application). Add your domain to authorized JavaScript origins. Enable Google Drive API and Google Picker API. |
| **Google Picker API** | API Key | Same project → Credentials → API Key. Restrict to Google Picker API. |
| **Facebook Developer** | App ID + Access Token | Create a Meta App → Add Marketing API product. Generate a User Access Token with `catalog_management` and `business_management` permissions. |
| **MySQL Database** | Connection string | Any MySQL 8.0+ provider: PlanetScale, TiDB Cloud (free tier), AWS RDS, or local Docker. |
| **AWS S3** | Bucket + Access Keys | Create an S3 bucket with public read access. Generate IAM access key with `s3:PutObject` and `s3:GetObject` permissions. |

### Local Development Environment

```bash
# Required software
node --version    # v18+ required (v22 recommended)
pnpm --version    # v8+ required

# Clone and install
git clone <your-repo-url> cpv-uploader
cd cpv-uploader
pnpm install
```

### Environment Variables File

Create a `.env` file in the project root:

```env
# ===== Database =====
DATABASE_URL=mysql://user:password@host:port/database?ssl={"rejectUnauthorized":true}

# ===== Authentication =====
JWT_SECRET=your-random-secret-string-at-least-32-chars

# ===== Google OAuth (Frontend) =====
VITE_GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIzaSy...your-picker-api-key
VITE_GOOGLE_APP_ID=123456789

# ===== AWS S3 Storage =====
S3_BUCKET=your-bucket-name
S3_REGION=ap-northeast-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=https://s3.ap-northeast-1.amazonaws.com
S3_CDN_URL=https://your-bucket.s3.ap-northeast-1.amazonaws.com
```

---

## 5. Phase 1 — Project Scaffolding

### Goal
Set up the monorepo structure with React frontend, Express backend, tRPC wiring, and Vite dev server.

### Directory Structure

```
cpv-uploader/
├── client/                    # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── contexts/          # React contexts (Auth, Language, Theme)
│   │   ├── pages/             # Page-level components
│   │   ├── lib/               # tRPC client setup
│   │   ├── App.tsx            # Router and layout
│   │   ├── main.tsx           # Entry point with providers
│   │   ├── index.css          # Global styles and Tailwind
│   │   ├── cpv.css            # Application-specific styles
│   │   ├── i18n.ts            # Translation strings
│   │   └── types.ts           # Shared frontend types
│   └── index.html             # HTML entry point
├── server/                    # Backend (Express + tRPC)
│   ├── routers.ts             # All tRPC procedures
│   ├── db.ts                  # Database query helpers
│   └── storage.ts             # S3 upload/download helpers
├── drizzle/                   # Database schema and migrations
│   ├── schema.ts              # Table definitions
│   └── relations.ts           # Table relationships
├── shared/                    # Shared types and constants
│   ├── types.ts
│   └── const.ts
├── package.json
├── vite.config.ts
├── drizzle.config.ts
└── tsconfig.json
```

### Step 1: Initialize the Project

```bash
mkdir cpv-uploader && cd cpv-uploader
pnpm init

# Install core dependencies
pnpm add react react-dom express @trpc/server @trpc/client @trpc/react-query \
  @tanstack/react-query drizzle-orm mysql2 zod superjson cookie jose \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Install dev dependencies
pnpm add -D typescript vite @vitejs/plugin-react tailwindcss \
  @tailwindcss/vite esbuild tsx vitest drizzle-kit \
  @types/react @types/react-dom @types/express @types/cookie
```

### Step 2: Configure Vite for Full-Stack Development

The Vite config serves two purposes: it builds the React frontend AND proxies API requests to the Express backend during development.

```typescript
// vite.config.ts (simplified)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
```

### Step 3: Set Up the Express + tRPC Server

```typescript
// server/index.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./context";

const app = express();
app.use(express.json({ limit: "100mb" }));

// Mount tRPC
app.use("/api/trpc", createExpressMiddleware({
  router: appRouter,
  createContext,
}));

// In production, serve the built frontend
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist/public"));
  app.get("*", (req, res) => {
    res.sendFile("dist/public/index.html", { root: "." });
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

### Step 4: Wire tRPC Client in React

```typescript
// client/src/lib/trpc.ts
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../server/routers";

export const trpc = createTRPCReact<AppRouter>();
```

```typescript
// client/src/main.tsx
import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
```

### Verification Checkpoint
At this point, you should be able to run `pnpm dev` and see a blank React page. The tRPC client should be able to call a simple `hello` procedure on the server.

---

## 6. Phase 2 — Database Schema Design

### Goal
Design and create the database tables that power the entire application.

### Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    users      │     │    companies      │     │ company_members   │
├──────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK)      │     │ id (PK)          │     │ id (PK)          │
│ openId       │     │ name             │     │ companyId (FK)   │
│ name         │     │ facebookToken    │     │ email            │
│ email        │     │ catalogs (JSON)  │     │ memberRole       │
│ role         │     │ accessKey        │     │ status           │
│ createdAt    │     │ tokenExpiresAt   │     │ userId (FK)      │
│ updatedAt    │     │ createdBy        │     │ createdAt        │
└──────────────┘     │ createdAt        │     └──────────────────┘
                     └──────────────────┘
                                              ┌──────────────────┐
┌──────────────────┐                          │  app_settings     │
│  upload_records   │                          ├──────────────────┤
├──────────────────┤                          │ id (PK)          │
│ id (PK)          │                          │ settingKey       │
│ companyId (FK)   │                          │ settingValue     │
│ catalogId        │                          │ updatedAt        │
│ retailerId       │                          └──────────────────┘
│ productName      │
│ productImageUrl  │
│ video4x5Download │
│ video4x5Embed    │
│ video9x16Download│
│ video9x16Embed   │
│ clientName       │
│ uploadTimestamp   │
│ uploadedBy       │
└──────────────────┘
```

### Schema Implementation

```typescript
// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

// Users table — stores Google-authenticated users
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// Companies table — each company has its own Facebook token and catalogs
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  facebookAccessToken: text("facebookAccessToken"),
  catalogs: text("catalogs"), // JSON array: [{id: "123", name: "My Catalog"}]
  accessKey: varchar("accessKey", { length: 255 }),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Company Members — maps emails to companies with roles
export const companyMembers = mysqlTable("company_members", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  memberRole: mysqlEnum("memberRole", ["owner", "member"]).default("member").notNull(),
  status: mysqlEnum("status", ["active", "pending"]).default("pending").notNull(),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Upload Records — tracks every video upload to a catalog product
export const uploadRecords = mysqlTable("upload_records", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  catalogId: varchar("catalogId", { length: 64 }).notNull(),
  retailerId: varchar("retailerId", { length: 255 }).notNull(),
  productName: varchar("productName", { length: 512 }).notNull(),
  productImageUrl: text("productImageUrl"),
  video4x5Download: text("video4x5Download"),
  video4x5Embed: text("video4x5Embed"),
  video9x16Download: text("video9x16Download"),
  video9x16Embed: text("video9x16Embed"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  uploadTimestamp: timestamp("uploadTimestamp").defaultNow().notNull(),
  uploadedBy: varchar("uploadedBy", { length: 255 }),
});

// App Settings — key-value store for global configuration
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 128 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
```

### Why These Tables?

| Table | Business Purpose |
|-------|-----------------|
| `users` | Stores anyone who logs in via Google OAuth. The `role` field separates admins from regular users. |
| `companies` | Each client/brand gets its own company record with an isolated Facebook Access Token. This prevents token leakage between clients. |
| `company_members` | Maps user emails to companies. Supports invitation flow — a member starts as "pending" and becomes "active" when they first log in. |
| `upload_records` | The audit trail. Every video upload creates a record linking the product (retailerId + catalogId) to the video URLs (download + embed for each aspect ratio). |
| `app_settings` | Stores global settings like Terms of Service text, default configurations, etc. Simple key-value store. |

### Push Schema to Database

```bash
# Generate migration SQL and apply it
pnpm db:push
```

---

## 7. Phase 3 — Google OAuth Login

### Goal
Let users sign in with their Google account to identify themselves and access Google Drive.

### Why Google OAuth (Not Email/Password)?

Three reasons:

1. **Google Drive access** — Users need to pick videos from their team's shared Google Drive folders. Google OAuth gives us a token that works with the Drive API and Picker API.
2. **Zero password management** — No password hashing, no reset flows, no security liability.
3. **Email verification for free** — Google guarantees the email is verified, which we use for company membership matching.

### Implementation: Google Identity Services (GIS)

Google's current recommended approach is the **Google Identity Services** library, not the deprecated `gapi.auth2`.

```html
<!-- client/index.html — Load the GIS library -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script src="https://apis.google.com/js/api.js" async defer></script>
```

```typescript
// client/src/contexts/GoogleAuthContext.tsx
import React, { createContext, useContext, useState, useCallback } from "react";

interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  accessToken: string;
}

interface GoogleAuthContextType {
  user: GoogleUser | null;
  isLoggedIn: boolean;
  handleGoogleLogin: () => void;
  handleGoogleLogout: () => void;
  handleReauthorize: () => void;
}

const GoogleAuthContext = createContext<GoogleAuthContextType>(null!);

// Scopes we request — Drive access is critical for the video picker
const GOOGLE_API_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);

  const handleGoogleLogin = useCallback(() => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: GOOGLE_API_SCOPES,
      callback: async (tokenResponse) => {
        if (tokenResponse.access_token) {
          // Fetch user profile
          const profileResp = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
          );
          const profile = await profileResp.json();
          setUser({
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
            accessToken: tokenResponse.access_token,
          });
        }
      },
    });
    client.requestAccessToken();
  }, []);

  const handleReauthorize = useCallback(() => {
    // Revoke existing token first, then re-request with consent screen
    if (user?.accessToken) {
      google.accounts.oauth2.revoke(user.accessToken, () => {
        setUser(null);
        // Re-request with prompt: "consent" to force checkbox display
        const client = google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          scope: GOOGLE_API_SCOPES,
          prompt: "consent",
          callback: async (tokenResponse) => {
            if (tokenResponse.access_token) {
              const profileResp = await fetch(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
              );
              const profile = await profileResp.json();
              setUser({
                email: profile.email,
                name: profile.name,
                picture: profile.picture,
                accessToken: tokenResponse.access_token,
              });
            }
          },
        });
        client.requestAccessToken();
      });
    } else {
      handleGoogleLogin();
    }
  }, [user, handleGoogleLogin]);

  const handleGoogleLogout = useCallback(() => {
    if (user?.accessToken) {
      google.accounts.oauth2.revoke(user.accessToken, () => {});
    }
    setUser(null);
  }, [user]);

  return (
    <GoogleAuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      handleGoogleLogin,
      handleGoogleLogout,
      handleReauthorize,
    }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export const useGoogleAuth = () => useContext(GoogleAuthContext);
```

### Critical UX Issue: Drive Permission Checkbox

When users log in with Google, they see a consent screen with checkboxes for each permission scope. Some users **uncheck the Google Drive permission**, which causes all Drive-related features to fail silently.

**Solution**: When a Drive API call returns a 403 or 401 error, show a specific error message telling the user to re-authorize with full permissions, and provide a "Re-authorize" button that revokes the current token and forces the consent screen to appear again with `prompt: "consent"`.

---

## 8. Phase 4 — Facebook Graph API Integration

### Goal
Connect to Meta's Graph API to read product catalogs and upload videos to products.

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /v21.0/me` | GET | Validate the access token |
| `GET /v21.0/{catalog_id}?fields=name` | GET | Fetch catalog name |
| `GET /v21.0/{catalog_id}/products?fields=id,name,retailer_id,image_url,availability,video` | GET | List products in a catalog |
| `GET /v21.0/{catalog_id}/product_sets` | GET | List product sets (subgroups) |
| `POST /v21.0/{catalog_id}/items_batch` | POST | Batch update products (add/remove videos) |
| `GET /v21.0/debug_token?input_token={token}` | GET | Check token expiration |

### Token Validation

Before any catalog operation, validate the token:

```typescript
// server/routers.ts — facebook.validateToken
async function validateToken(accessToken: string) {
  const url = `https://graph.facebook.com/v21.0/me?access_token=${accessToken}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    return { valid: false, message: data?.error?.message || "Invalid token" };
  }
  return { valid: true, message: `Token valid. User: ${data.name || data.id}` };
}
```

### Fetching Products from a Catalog

The Graph API returns paginated results. You must follow the `paging.next` URL to get all products:

```typescript
async function fetchCatalogProducts(
  catalogId: string,
  accessToken: string,
  limit: number = 50
) {
  const fields = "id,name,retailer_id,image_url,availability,video";
  let url = `https://graph.facebook.com/v21.0/${catalogId}/products?fields=${fields}&limit=${limit}&access_token=${accessToken}`;
  
  const allProducts = [];
  while (url) {
    const response = await fetch(url);
    const data = await response.json();
    if (data.data) allProducts.push(...data.data);
    url = data.paging?.next || null; // Follow pagination
  }
  return allProducts;
}
```

### Uploading a Video to a Product (Batch API)

Meta's Catalog API uses a **Batch API** to update product attributes. To attach a video to a product, you send an UPDATE request with the video URL:

```typescript
async function uploadVideoToProduct(
  catalogId: string,
  accessToken: string,
  retailerId: string,
  videoUrl: string
) {
  const batchUrl = `https://graph.facebook.com/v21.0/${catalogId}/items_batch`;
  const payload = {
    access_token: accessToken,
    item_type: "PRODUCT_ITEM",
    requests: [{
      method: "UPDATE",
      data: {
        id: retailerId,
        video: [{ url: videoUrl }],
      },
    }],
  };

  const response = await fetch(batchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  const result = await response.json();
  // The API may return a "handle" for async processing
  return {
    success: response.ok,
    handle: result?.handles?.[0] || null,
  };
}
```

### Important: Video URL Requirements

Meta's Graph API requires that the video URL:
- Is **publicly accessible** (no authentication required to download)
- Points to a valid video file (MP4 recommended)
- Is served over **HTTPS**

This is why we upload videos to S3 first (which gives us a public URL), then pass that URL to the Graph API.

---

## 9. Phase 5 — Product Table and Catalog Browser

### Goal
Build the main UI that displays products from a Facebook Catalog in a table, with video upload slots for each product.

### Component Architecture

```
MainApp.tsx
├── Catalog Selector (dropdown of available catalogs)
├── Filter Bar (search, product set filter, video status filter, in-stock toggle)
├── ProductTable.tsx
│   ├── Table Header (checkbox, image, name, status, retailer ID, video columns)
│   └── Table Rows (one per product)
│       ├── Product Image (thumbnail)
│       ├── Product Info (name, availability badge)
│       ├── Master Video Cell (4:5 or 9:16)
│       │   ├── If uploaded: Video preview + re-upload button
│       │   ├── If processing: Spinner + "Processing..." message
│       │   └── If empty: GoogleDriveUploader + LocalFileUploader
│       └── Other Ratio Video Cell
│           └── Same pattern as Master Video Cell
└── Bulk Actions Bar (select all, bulk upload)
```

### Key Design Decisions

**Why two video columns?** Meta supports multiple video aspect ratios per product. The "Master Video" column handles the primary format (4:5 for feed or 9:16 for Reels), while the "Other Ratio" column handles the secondary format. This lets marketing teams upload both formats in one session.

**Why show product images?** Marketing teams need visual confirmation they're uploading to the correct product. The image comes directly from the Facebook Catalog's `image_url` field.

**Why the "In Stock" toggle?** Catalogs often contain thousands of products, but teams only want to upload videos for products currently in stock. The toggle filters by `availability === "in stock"`.

### Product Data Flow

```
1. User selects a catalog from dropdown
2. Frontend calls trpc.slideshow.fetchProducts({ catalogId, accessToken })
3. Server fetches from Graph API: GET /{catalogId}/products
4. Server returns typed product array to frontend
5. Frontend also calls trpc.uploads.listByCatalog({ catalogId })
6. Frontend merges: for each product, check if an upload record exists
7. Products with existing uploads show video previews
8. Products without uploads show upload buttons
```

---

## 10. Phase 6 — Video Upload Pipeline

### Goal
Implement the complete flow from video selection to Facebook Catalog update.

### Upload Flow (Step by Step)

```
User selects video file (from Drive or local)
         │
         ▼
┌─────────────────────────┐
│ 1. Upload to Google     │  (if from Drive: already has a URL)
│    Drive or read local  │  (if local: read as ArrayBuffer)
│    file                 │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 2. Upload to S3         │  POST video bytes to server
│    via server endpoint  │  Server calls storagePut()
│    Returns public URL   │  Returns: https://s3.../video.mp4
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 3. Call Facebook        │  POST /{catalogId}/items_batch
│    Batch API            │  { method: "UPDATE",
│    with S3 video URL    │    data: { id: retailerId,
│                         │            video: [{ url: s3Url }] }}
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 4. Save upload record   │  INSERT into upload_records table
│    to database          │  with all metadata
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 5. Update UI            │  Show video preview in the
│                         │  product table cell
└─────────────────────────┘
```

### Video Preview After Upload

After upload, the product table cell shows a video preview. The implementation uses a `<video>` element with the Google Drive embed URL or S3 URL:

```tsx
// Simplified video preview logic
function VideoPreview({ video }: { video: UploadedVideo }) {
  const [error, setError] = useState(false);
  
  if (error) {
    // Fallback: show a link to open in new tab
    return (
      <a href={video.downloadUrl} target="_blank" rel="noopener">
        📹 Open Video
      </a>
    );
  }
  
  return (
    <video
      src={video.downloadUrl}
      controls
      style={{ maxWidth: "120px", maxHeight: "150px" }}
      onError={() => setError(true)}
    />
  );
}
```

---

## 11. Phase 7 — Google Drive Integration

### Goal
Let users pick videos directly from their Google Drive using the Google Picker API.

### Why Google Drive?

Marketing teams typically store their product videos in shared Google Drive folders organized by brand, campaign, or product line. Rather than downloading videos to their computer and re-uploading, the tool lets them pick directly from Drive.

### Google Picker Implementation

```typescript
// Load the Google Picker API
function openGooglePicker(accessToken: string, callback: (file: DriveFile) => void) {
  gapi.load("picker", () => {
    const picker = new google.picker.PickerBuilder()
      .addView(new google.picker.DocsView()
        .setIncludeFolders(true)
        .setMimeTypes("video/mp4,video/quicktime,video/x-msvideo,video/webm"))
      .setOAuthToken(accessToken)
      .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY)
      .setAppId(import.meta.env.VITE_GOOGLE_APP_ID)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const file = data.docs[0];
          callback({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            downloadUrl: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            embedUrl: `https://drive.google.com/file/d/${file.id}/preview`,
          });
        }
      })
      .build();
    picker.setVisible(true);
  });
}
```

### Upload Flow from Google Drive

When a user picks a video from Google Drive, the flow is:

1. **Get the file ID** from the Picker callback
2. **Download the file** using the Drive API with the user's access token: `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`
3. **Upload to S3** via the server (because the Drive download URL requires authentication)
4. **Send the S3 URL** to Facebook's Batch API
5. **Save the record** with both the Drive embed URL (for preview) and the S3 URL (for the catalog)

### Permission Error Handling

If the user didn't grant Google Drive permissions during login, the Picker will fail or the download will return 403. The UI detects this and shows:

> "Google Drive 權限不足。請重新登入並確認勾選「查看及下載 Google 雲端硬碟中的所有檔案」權限。"

With a prominent "重新登入並授權 Google Drive 權限" button.

---

## 12. Phase 8 — Multi-Company Architecture

### Goal
Support multiple brands/clients, each with their own Facebook Access Token and team members.

### How It Works

```
Company A (RhinoShield)
├── Facebook Token: EAA...xxx
├── Catalogs: [{id: "111", name: "TW Catalog"}, {id: "222", name: "JP Catalog"}]
├── Members:
│   ├── alice@rhinoshield.com (owner, active)
│   ├── bob@rhinoshield.com (member, active)
│   └── charlie@rhinoshield.com (member, pending)
└── Access Key: rhinoshield-2024

Company B (Modish)
├── Facebook Token: EAA...yyy
├── Catalogs: [{id: "333", name: "dpshop Catalog"}]
├── Members:
│   ├── david@modish.com (owner, active)
│   └── eve@modish.com (member, active)
└── Access Key: modish-2024
```

### Company Selection Flow

1. User logs in with Google → we get their email
2. Query `company_members` table for all companies where this email is a member
3. If the user belongs to multiple companies, show a company selector
4. Selected company's Facebook token is used for all catalog operations
5. Upload records are tagged with the `companyId`

### Member Invitation Flow

```
Admin creates company → adds member email "bob@example.com"
                         ↓
                    Status: "pending"
                         ↓
Bob logs in with Google (bob@example.com)
                         ↓
System calls members.activate({ email: "bob@example.com" })
                         ↓
                    Status: "active"
                         ↓
Bob can now access the company's catalogs
```

### Token Expiration Monitoring

Facebook Access Tokens expire. The system:
1. Checks token expiration via `GET /debug_token` when a token is saved
2. Stores `tokenExpiresAt` in the companies table
3. Shows a warning banner in the UI when the token is about to expire
4. Provides a "Refresh Token Info" button for manual re-check

---

## 13. Phase 9 — Admin Panel and Video Log

### Goal
Build a management dashboard for reviewing upload history, managing companies, and exporting data.

### Admin Panel Tabs

| Tab | Content |
|-----|---------|
| **Video Log** | All upload records with search, filter by catalog, date range, and XLSX export. Shows uploader email/name. Deduplicates by retailerId + catalogId (shows only the latest). |
| **Company/Catalog/Member Management** | CRUD for companies, catalog assignments, and member invitations. Token validation and expiration monitoring. |

### Video Log Deduplication

The admin panel shows deduplicated records — if the same product was uploaded multiple times, only the latest record appears. This is implemented in the database query:

```typescript
// server/db.ts — getAllUploadRecords with deduplication
export async function getAllUploadRecords() {
  // Subquery: get the max (latest) ID for each retailerId + catalogId combination
  const latestIds = db
    .select({
      maxId: sql<number>`MAX(${uploadRecords.id})`.as("maxId"),
    })
    .from(uploadRecords)
    .groupBy(uploadRecords.retailerId, uploadRecords.catalogId)
    .as("latestIds");

  // Join with the main table to get full records for only the latest uploads
  const results = await db
    .select()
    .from(uploadRecords)
    .innerJoin(latestIds, eq(uploadRecords.id, latestIds.maxId))
    .orderBy(desc(uploadRecords.uploadTimestamp));

  return results.map((r) => r.upload_records);
}
```

### XLSX Export

The admin panel supports exporting filtered records to XLSX format using the `xlsx` library on the client side:

```typescript
import * as XLSX from "xlsx";

function exportToXLSX(records: UploadRecord[], filename: string) {
  const data = records.map(r => ({
    "Product Name": r.productName,
    "Retailer ID": r.retailerId,
    "Catalog ID": r.catalogId,
    "Company": r.clientName,
    "Uploader": r.uploadedBy || "N/A",
    "Master Video (4:5)": r.video4x5Download ? "✓" : "—",
    "Other Ratio (9:16)": r.video9x16Download ? "✓" : "—",
    "Upload Date": new Date(r.uploadTimestamp).toLocaleString(),
  }));
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Video Log");
  XLSX.writeFile(wb, filename);
}
```

---

## 14. Phase 10 — Internationalization (i18n)

### Goal
Support English and Traditional Chinese (繁體中文) throughout the entire UI.

### Implementation: Lightweight Custom i18n

Rather than using a heavy library like `react-i18next`, this project uses a simple context-based approach:

```typescript
// client/src/i18n.ts
export const translations = {
  en: {
    home: "Home",
    uploadTool: "Video Upload Tool",
    adminPanel: "Admin Panel",
    selectCatalog: "Select a catalog to begin.",
    searchProducts: "Search products...",
    masterVideo: "Master Video (9:16 & 4:5)",
    otherVideo: "Other Ratios",
    upload: "Upload",
    // ... 200+ keys
  },
  "zh-TW": {
    home: "首頁",
    uploadTool: "影片上傳工具",
    adminPanel: "管理面板",
    selectCatalog: "選擇目錄以開始。",
    searchProducts: "搜尋商品...",
    masterVideo: "主影片 (9:16 & 4:5)",
    otherVideo: "其他尺寸",
    upload: "上傳",
    // ... 200+ keys
  },
};
```

```typescript
// client/src/contexts/LanguageContext.tsx
const LanguageContext = createContext({
  language: "zh-TW",
  setLanguage: (lang: string) => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    localStorage.getItem("cpv-language") || "zh-TW"
  );
  
  const t = useCallback((key: string) => {
    return translations[language]?.[key] || translations.en[key] || key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
```

### Language Switcher

A dropdown in the sidebar lets users switch between English and 繁體中文. The selection is persisted in `localStorage`.

---

## 15. Phase 11 — XLSX Import/Export

### Goal
Allow admins to bulk-import upload records from Excel files and export filtered data.

### Import Flow

1. Admin clicks "匯入 Excel" button
2. File picker opens, user selects an `.xlsx` file
3. Client-side `xlsx` library parses the file
4. Each row is validated against expected columns (Retailer ID, Catalog ID, Product Name, etc.)
5. Valid records are sent to `trpc.uploads.createBatch` in a single batch mutation
6. UI shows success/error count

### Export Flow

1. Admin applies filters (date range, catalog, search term)
2. Clicks "匯出 XLSX" button
3. Client-side generates the XLSX file from the currently filtered data
4. Browser downloads the file

---

## 16. Phase 12 — Security, Error Handling, and Polish

### Security Considerations

| Concern | Implementation |
|---------|---------------|
| **Facebook Token Storage** | Tokens are stored encrypted in the database. The API never returns the full token to the frontend — it's masked as `EAA...xxx`. Full token is only used server-side for API calls. |
| **Google OAuth Tokens** | Stored only in browser memory (React state). Never sent to our server. Used client-side for Drive API calls. |
| **Access Key Protection** | Each company has an optional access key that users must enter to access the upload tool. This prevents unauthorized access even if someone has the URL. |
| **Input Validation** | All tRPC inputs are validated with Zod schemas. Invalid data is rejected before reaching the database. |
| **CORS** | The Express server only accepts requests from the same origin (Vite proxy in dev, same domain in production). |

### Error Handling Patterns

```typescript
// Frontend: Wrap tRPC calls with user-friendly error messages
const uploadMutation = trpc.uploads.create.useMutation({
  onSuccess: () => {
    toast.success(t("uploadSuccess"));
  },
  onError: (error) => {
    if (error.message.includes("token")) {
      toast.error(t("tokenExpired"));
    } else if (error.message.includes("permission")) {
      toast.error(t("drivePermissionError"));
    } else {
      toast.error(t("unknownUploadError"));
    }
  },
});
```

### Google Drive Permission Error UX

When a Drive upload fails due to insufficient permissions, the UI shows:

1. A red error message explaining the issue
2. Step-by-step instructions (with numbered list) on how to fix it
3. A prominent orange "重新登入並授權 Google Drive 權限" button
4. The button revokes the current token and forces the consent screen to reappear

---

## 17. Phase 13 — Deployment

### Option A: Docker + Cloud Run (Recommended)

```dockerfile
# Dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
# Deploy to Google Cloud Run
gcloud run deploy cpv-uploader \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=...,JWT_SECRET=...,S3_BUCKET=..."
```

### Option B: Railway / Render

Both platforms support Node.js apps out of the box. Set the build command to `pnpm build` and the start command to `node dist/index.js`. Add all environment variables in the platform's dashboard.

### Option C: VPS (DigitalOcean, AWS EC2)

```bash
# On the server
git clone <repo> && cd cpv-uploader
pnpm install && pnpm build
# Use PM2 for process management
pm2 start dist/index.js --name cpv-uploader
# Use nginx as reverse proxy with SSL
```

### Estimated Monthly Cost

| Component | Service | Cost |
|-----------|---------|------|
| **Server** | Cloud Run (free tier) or Railway ($5) | $0–5 |
| **Database** | TiDB Cloud (free tier) or PlanetScale | $0–5 |
| **File Storage** | AWS S3 (pay per use) | $1–5 |
| **Domain** | Optional custom domain | $0–12/yr |
| **Total** | | **$1–15/month** |

---

## 18. Complete File Tree

```
cpv-uploader/
├── client/
│   ├── index.html                    # HTML entry with Google SDK scripts
│   ├── src/
│   │   ├── App.tsx                   # Router (hash-based) + layout
│   │   ├── main.tsx                  # React entry with tRPC + QueryClient
│   │   ├── index.css                 # Tailwind + global theme variables
│   │   ├── cpv.css                   # Application-specific styles
│   │   ├── i18n.ts                   # EN + ZH-TW translations (~200 keys)
│   │   ├── types.ts                  # Frontend type definitions
│   │   ├── pages/
│   │   │   ├── MainApp.tsx           # Main upload tool (largest component)
│   │   │   ├── AdminPanel.tsx        # Admin dashboard with tabs
│   │   │   ├── HomePage.tsx          # Landing page
│   │   │   └── TermsOfServicePage.tsx
│   │   ├── components/
│   │   │   ├── ProductTable.tsx      # Product table with video cells
│   │   │   ├── GoogleDriveUploader.tsx # Drive picker + upload logic
│   │   │   ├── ReelsOverlay.tsx      # Video overlay editor
│   │   │   ├── AppLayout.tsx         # Sidebar + main content layout
│   │   │   ├── AppFooter.tsx         # Footer with links
│   │   │   ├── IntroGuide.tsx        # First-time user tutorial
│   │   │   ├── LanguageSwitcher.tsx  # EN/ZH-TW toggle
│   │   │   ├── ImagePreview.tsx      # Product image thumbnail
│   │   │   └── Toast.tsx             # Notification toasts
│   │   ├── contexts/
│   │   │   ├── GoogleAuthContext.tsx  # Google OAuth state
│   │   │   ├── LanguageContext.tsx    # i18n state
│   │   │   └── ThemeContext.tsx       # Light/dark theme
│   │   └── lib/
│   │       └── trpc.ts               # tRPC client binding
│   └── public/
│       └── favicon.ico
├── server/
│   ├── routers.ts                    # All tRPC procedures (~850 lines)
│   ├── db.ts                         # Drizzle query helpers (~400 lines)
│   └── storage.ts                    # S3 upload/download helpers
├── drizzle/
│   ├── schema.ts                     # 5 table definitions
│   ├── relations.ts                  # Table relationships
│   └── migrations/                   # Auto-generated SQL migrations
├── shared/
│   ├── types.ts                      # Shared TypeScript types
│   └── const.ts                      # Shared constants
├── package.json
├── vite.config.ts
├── drizzle.config.ts
├── tsconfig.json
└── .env                              # Environment variables (not committed)
```

---

## 19. Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL connection string with SSL |
| `JWT_SECRET` | Yes | Random string for session cookie signing (32+ chars) |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID |
| `VITE_GOOGLE_API_KEY` | Yes | Google Picker API Key |
| `VITE_GOOGLE_APP_ID` | Yes | Google Cloud Project Number |
| `S3_BUCKET` | Yes | AWS S3 bucket name |
| `S3_REGION` | Yes | AWS region (e.g., `ap-northeast-1`) |
| `S3_ACCESS_KEY_ID` | Yes | AWS IAM access key |
| `S3_SECRET_ACCESS_KEY` | Yes | AWS IAM secret key |
| `S3_ENDPOINT` | No | Custom S3 endpoint (for S3-compatible services) |
| `S3_CDN_URL` | No | CDN URL prefix for S3 objects |
| `PORT` | No | Server port (default: 3000) |

---

## 20. Common Pitfalls and Troubleshooting

### Facebook Token Expiration

**Symptom**: Catalog operations suddenly fail with "Invalid OAuth access token."

**Cause**: Facebook User Access Tokens expire after 60 days (long-lived) or 1 hour (short-lived).

**Fix**: Use a System User Token (never expires) or implement a token refresh flow. The app shows expiration warnings in the company settings panel.

### Google Drive Permission Not Granted

**Symptom**: Upload from Google Drive fails with "An unknown error occurred."

**Cause**: User unchecked the Google Drive permission checkbox during Google login.

**Fix**: The app now detects 403/401 errors from Drive API and shows a specific error message with a "Re-authorize" button that forces the consent screen to reappear.

### Video Not Appearing in Facebook Catalog

**Symptom**: Upload succeeds (no errors), but the video doesn't show in Commerce Manager.

**Cause**: Facebook processes videos asynchronously. It can take 5–30 minutes for the video to appear.

**Fix**: The Batch API returns a `handle` for async processing. You can check the status via `GET /{catalog_id}/check_batch_request_status?handle={handle}`.

### S3 Upload Fails with "Access Denied"

**Symptom**: Video upload to S3 returns 403.

**Cause**: IAM policy doesn't include `s3:PutObject` permission, or the bucket policy blocks public access.

**Fix**: Ensure the IAM user has `s3:PutObject` and `s3:GetObject` permissions. If you need public URLs, configure the bucket policy to allow public reads.

### Database Connection Timeout

**Symptom**: App crashes with "Connection lost: The server closed the connection."

**Cause**: MySQL connection pool exhausted or server-side timeout.

**Fix**: Configure connection pooling in Drizzle config. For TiDB/PlanetScale, ensure SSL is enabled in the connection string.

---

## Appendix: AI Vibe Coding Instructions

If you are an AI coding assistant (Cursor, Windsurf, Bolt, v0, Copilot, etc.) and have been given this document as context, here is how to use it effectively:

### Recommended Build Order

Follow the phases in order (Phase 1 → Phase 13). Each phase builds on the previous one. Do not skip phases.

### Key Files to Generate First

1. `drizzle/schema.ts` — Database schema (copy from Phase 2)
2. `server/routers.ts` — All API endpoints (build incrementally per phase)
3. `server/db.ts` — Database query helpers
4. `client/src/contexts/GoogleAuthContext.tsx` — Auth context
5. `client/src/pages/MainApp.tsx` — Main upload interface
6. `client/src/components/ProductTable.tsx` — Product table
7. `client/src/components/GoogleDriveUploader.tsx` — Drive integration
8. `client/src/pages/AdminPanel.tsx` — Admin dashboard
9. `client/src/i18n.ts` — Translations

### Things to Watch Out For

- **Facebook Graph API version**: Use `v21.0` or later. Older versions may have different field names.
- **Google Identity Services**: Do NOT use the deprecated `gapi.auth2`. Use `google.accounts.oauth2.initTokenClient`.
- **tRPC version**: Use v11 with superjson transformer. v10 has different API.
- **Tailwind CSS version**: Use v4 with `@tailwindcss/vite` plugin. v3 uses a different config format.
- **Video URL for Facebook**: Must be a publicly accessible HTTPS URL. Google Drive URLs require authentication and won't work directly — upload to S3 first.

### Testing Strategy

Write Vitest tests for:
- Database query helpers (mock the database connection)
- tRPC procedures (test input validation and business logic)
- Facebook API integration (mock fetch responses)

Do NOT write tests for React components unless specifically asked — focus on backend logic.

---

*This document was generated by Manus AI based on the actual CPV Video Uploader codebase. All code examples are derived from the production implementation.*
