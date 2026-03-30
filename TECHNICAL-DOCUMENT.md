# CPV Video Uploader — Technical Document

**Version:** 2.0  
**Last Updated:** March 30, 2026  
**Author:** Lion Musk / Manus AI  
**Audience:** Engineering Team, Marketing Team, External AI Agents

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Project Structure](#6-project-structure)
7. [Database Design](#7-database-design)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Backend API Reference](#9-backend-api-reference)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Facebook Graph API Integration](#11-facebook-graph-api-integration)
12. [Google Drive Integration](#12-google-drive-integration)
13. [Multi-Company Architecture](#13-multi-company-architecture)
14. [File Storage (S3)](#14-file-storage-s3)
15. [Admin Panel & Video Log](#15-admin-panel--video-log)
16. [Internationalization (i18n)](#16-internationalization-i18n)
17. [Testing Strategy](#17-testing-strategy)
18. [Environment Variables](#18-environment-variables)
19. [Deployment Architecture](#19-deployment-architecture)
20. [Security Considerations](#20-security-considerations)
21. [Build & Development Guide](#21-build--development-guide)
22. [Known Limitations & Future Roadmap](#22-known-limitations--future-roadmap)

---

## 1. Executive Summary

The CPV (Catalog Product Video) Video Uploader is a full-stack web application designed to automate the process of uploading product videos to Facebook/Meta Commerce Catalogs. The tool was built for RhinoShield and its partner brands to solve the manual, time-consuming process of attaching video content to catalog products via the Meta Commerce Manager interface.

The application supports multiple companies with isolated credentials, Google OAuth-based authentication, Google Drive video sourcing, and batch video upload operations through the Facebook Graph API. It reduces the per-product video upload time from approximately 15 minutes of manual work to under 10 seconds of automated processing.

---

## 2. Problem Statement

Meta Commerce Manager provides no bulk video upload capability for catalog products. Each product video must be manually uploaded one at a time through the web interface, which involves the following steps for each product:

1. Navigate to the specific catalog in Commerce Manager.
2. Find the product by searching or scrolling.
3. Click "Edit" on the product.
4. Upload the video file (wait for processing).
5. Save the changes.

For a catalog with 500 products, this process would take approximately 125 hours of manual labor. This is unsustainable for brands that need to regularly update product videos across multiple catalogs and multiple business accounts.

The CPV Video Uploader automates this entire workflow by leveraging the Facebook Graph API's Catalog Batch API endpoint, allowing bulk video attachment operations that complete in seconds per product.

---

## 3. Solution Overview

The CPV Video Uploader provides the following core capabilities:

**For Marketing Teams:**
- One-click batch video upload to Facebook Catalogs.
- Support for both 4:5 (feed) and 9:16 (Reels/Stories) aspect ratios.
- Google Drive integration for sourcing video files.
- Visual admin dashboard with upload history, filtering, and XLSX export.
- Multi-company support for managing multiple brand accounts.

**For Engineering Teams:**
- Type-safe full-stack TypeScript monorepo (React + tRPC + Express).
- Drizzle ORM with MySQL/TiDB for structured data persistence.
- S3-compatible object storage for media files.
- Facebook Graph API v21.0 integration with token management.
- Google OAuth 2.0 authentication with company-level access control.

---

## 4. System Architecture

The application follows a monorepo architecture with a clear separation between client, server, and shared code. All communication between the frontend and backend uses tRPC, which provides end-to-end type safety without the need for manual API contract definitions.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ MainApp  │  │  Admin   │  │  Terms   │  │   HomePage   │   │
│  │  (Upload) │  │  Panel   │  │  of Svc  │  │  (Landing)   │   │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────────┘   │
│       │              │                                          │
│  ┌────┴──────────────┴────────────────────────────────────┐    │
│  │              tRPC Client (httpBatchLink)                │    │
│  └────────────────────────┬───────────────────────────────┘    │
└───────────────────────────┼─────────────────────────────────────┘
                            │ HTTP POST /api/trpc/*
┌───────────────────────────┼─────────────────────────────────────┐
│                       SERVER (Express)                          │
│                            │                                    │
│  ┌─────────────────────────┴──────────────────────────────┐    │
│  │              tRPC Router (appRouter)                     │    │
│  │                                                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ company  │ │ members  │ │ uploads  │ │ facebook │  │    │
│  │  │  router  │ │  router  │ │  router  │ │  router  │  │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │    │
│  │       │             │            │             │         │    │
│  │  ┌────┴─────────────┴────────────┴─────────────┴────┐   │    │
│  │  │              Database Layer (Drizzle ORM)         │   │    │
│  │  └──────────────────────┬───────────────────────────┘   │    │
│  └─────────────────────────┼───────────────────────────────┘    │
└────────────────────────────┼────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────┴───┐  ┌──────┴─────┐  ┌────┴──────────┐
     │  MySQL /   │  │    S3      │  │  Facebook     │
     │  TiDB      │  │  Storage   │  │  Graph API    │
     └────────────┘  └────────────┘  └───────────────┘
```

The architecture consists of four layers:

**Presentation Layer (Client):** React 19 single-page application with Tailwind CSS 4, served as static assets. Uses tRPC React Query hooks for all data fetching and mutations.

**Application Layer (Server):** Express 4 server with tRPC v11 middleware handling all API requests under `/api/trpc/*`. Business logic is organized into domain-specific routers (company, members, uploads, facebook).

**Data Layer:** Drizzle ORM connecting to MySQL/TiDB for structured data. S3-compatible object storage for video and image files.

**External Services:** Facebook Graph API v21.0 for catalog operations, Google OAuth 2.0 for user authentication, and Google Drive API for video sourcing.

---

## 5. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend Framework | React | 19 | UI component rendering and state management |
| Styling | Tailwind CSS | 4 | Utility-first CSS framework |
| UI Components | shadcn/ui | Latest | Pre-built accessible component library |
| Type-safe API | tRPC | 11 | End-to-end type-safe RPC between client and server |
| Server Framework | Express | 4 | HTTP server and middleware |
| ORM | Drizzle ORM | 0.44+ | Type-safe SQL query builder and schema management |
| Database | MySQL / TiDB | 8.0+ | Relational data storage |
| Build Tool | Vite | 6 | Frontend bundling and dev server |
| Runtime | Node.js | 22 | Server-side JavaScript runtime |
| Language | TypeScript | 5.9 | Static type checking across the entire stack |
| Package Manager | pnpm | Latest | Fast, disk-efficient package management |
| Serialization | SuperJSON | 1.13 | Preserves Date, Map, Set types across tRPC boundary |
| Schema Validation | Zod | 3 | Runtime input validation for all API endpoints |
| Data Fetching | TanStack React Query | 5 | Server state management with caching and invalidation |
| Spreadsheet | SheetJS (xlsx) | Latest | XLSX export for admin panel reports |
| HTTP Client | Native fetch | Built-in | Facebook Graph API and Google API calls |

---

## 6. Project Structure

```
cpv-uploader/
├── client/                          # Frontend application
│   ├── index.html                   # HTML entry point (Google Fonts loaded here)
│   ├── public/                      # Static assets (favicon, robots.txt only)
│   └── src/
│       ├── main.tsx                 # React entry + tRPC provider setup
│       ├── App.tsx                  # Route definitions and layout
│       ├── index.css                # Global styles + Tailwind theme tokens
│       ├── cpv.css                  # Application-specific styles
│       ├── i18n.ts                  # Internationalization (EN/ZH-TW)
│       ├── const.ts                 # Login URL builder (Manus OAuth)
│       ├── _core/
│       │   └── hooks/useAuth.ts     # Authentication hook
│       ├── contexts/
│       │   ├── GoogleAuthContext.tsx # Google OAuth state management
│       │   ├── LanguageContext.tsx   # i18n context provider
│       │   └── ThemeContext.tsx      # Dark/light theme context
│       ├── components/
│       │   ├── AppLayout.tsx        # Shared layout with header/footer
│       │   ├── AppFooter.tsx        # Footer component
│       │   ├── GoogleDriveUploader.tsx  # Google Drive file picker
│       │   ├── ProductTable.tsx     # Product listing table
│       │   ├── ReelsOverlay.tsx     # Reels overlay preview component
│       │   ├── IntroGuide.tsx       # First-time user guide
│       │   ├── LanguageSwitcher.tsx  # EN/ZH toggle
│       │   ├── ImagePreview.tsx     # Image preview modal
│       │   ├── Toast.tsx            # Toast notification
│       │   └── ui/                  # shadcn/ui components
│       ├── pages/
│       │   ├── MainApp.tsx          # Primary upload workflow (44KB)
│       │   ├── AdminPanel.tsx       # Admin dashboard (81KB)
│       │   ├── HomePage.tsx         # Landing page
│       │   └── TermsOfServicePage.tsx  # Terms of service
│       └── lib/
│           └── trpc.ts             # tRPC client configuration
│
├── server/                          # Backend application
│   ├── _core/                       # Framework plumbing (Manus platform)
│   │   ├── index.ts                 # Express server entry point
│   │   ├── context.ts              # tRPC context builder (auth)
│   │   ├── trpc.ts                 # tRPC instance + procedures
│   │   ├── env.ts                  # Environment variable loader
│   │   ├── oauth.ts                # Manus OAuth handler
│   │   ├── sdk.ts                  # Manus SDK client
│   │   ├── cookies.ts              # Cookie configuration
│   │   ├── notification.ts         # Owner notification helper
│   │   ├── llm.ts                  # LLM integration helper
│   │   ├── imageGeneration.ts      # Image generation helper
│   │   ├── voiceTranscription.ts   # Voice transcription helper
│   │   ├── map.ts                  # Google Maps proxy
│   │   ├── dataApi.ts              # Data API helper
│   │   ├── vite.ts                 # Vite dev server integration
│   │   └── systemRouter.ts         # System health routes
│   ├── routers.ts                   # All tRPC route definitions (855 lines)
│   ├── db.ts                        # Database query helpers (400 lines)
│   ├── storage.ts                   # S3 storage helpers
│   └── *.test.ts                    # Vitest test files
│
├── drizzle/                         # Database schema and migrations
│   ├── schema.ts                    # Table definitions
│   ├── relations.ts                 # Table relationships
│   ├── meta/                        # Migration metadata
│   └── migrations/                  # SQL migration files
│
├── shared/                          # Code shared between client and server
│   ├── const.ts                     # Shared constants
│   ├── types.ts                     # Shared TypeScript types
│   └── _core/errors.ts             # Error definitions
│
├── vite.config.ts                   # Vite + Express integration config
├── drizzle.config.ts                # Drizzle migration config
├── vitest.config.ts                 # Test configuration
├── package.json                     # Dependencies and scripts
└── tsconfig.json                    # TypeScript configuration
```

---

## 7. Database Design

The application uses 5 core tables (excluding the `slideshow_templates` table which is related to the Video Generator feature and not part of the core upload workflow).

### 7.1 Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    users     │       │   companies      │       │ company_members  │
├──────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)      │       │ id (PK)          │◄──────│ companyId (FK)   │
│ openId (UQ)  │       │ name             │       │ id (PK)          │
│ name         │       │ facebookAccess-  │       │ email            │
│ email        │       │   Token          │       │ memberRole       │
│ loginMethod  │       │ catalogs (JSON)  │       │ status           │
│ role         │       │ accessKey        │       │ userId           │
│ createdAt    │       │ tokenExpiresAt   │       │ createdAt        │
│ updatedAt    │       │ createdBy        │       │ updatedAt        │
│ lastSignedIn │       │ createdAt        │       └──────────────────┘
└──────────────┘       │ updatedAt        │
                       └────────┬─────────┘
                                │
                       ┌────────┴─────────┐
                       │ upload_records   │
                       ├──────────────────┤
                       │ id (PK)          │
                       │ companyId (FK)   │
                       │ catalogId        │
                       │ retailerId       │
                       │ productName      │
                       │ productImageUrl  │
                       │ video4x5Download │
                       │ video4x5Embed   │
                       │ video9x16Download│
                       │ video9x16Embed  │
                       │ clientName       │
                       │ uploadTimestamp  │
                       │ uploadedBy       │
                       └──────────────────┘

┌──────────────────┐
│  app_settings    │
├──────────────────┤
│ id (PK)          │
│ settingKey (UQ)  │
│ settingValue     │
│ updatedAt        │
└──────────────────┘
```

### 7.2 Table Specifications

#### `users` — User accounts (Manus OAuth)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT | PK, AUTO_INCREMENT | Surrogate primary key |
| openId | VARCHAR(64) | NOT NULL, UNIQUE | Manus OAuth identifier |
| name | TEXT | NULLABLE | Display name |
| email | VARCHAR(320) | NULLABLE | Email address |
| loginMethod | VARCHAR(64) | NULLABLE | Authentication method used |
| role | ENUM('user','admin') | NOT NULL, DEFAULT 'user' | Access level |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW | Account creation time |
| updatedAt | TIMESTAMP | NOT NULL, ON UPDATE NOW | Last modification time |
| lastSignedIn | TIMESTAMP | NOT NULL, DEFAULT NOW | Last login timestamp |

#### `companies` — Multi-tenant company accounts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT | PK, AUTO_INCREMENT | Company identifier |
| name | VARCHAR(255) | NOT NULL | Company display name |
| facebookAccessToken | TEXT | NULLABLE | Facebook Graph API token (encrypted at rest) |
| catalogs | TEXT | NULLABLE | JSON array of `[{id, name}]` catalog objects |
| accessKey | VARCHAR(255) | NULLABLE | Company access password for the upload tool |
| tokenExpiresAt | TIMESTAMP | NULLABLE | Facebook token expiration time |
| createdBy | INT | NOT NULL | User ID of company creator |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL, ON UPDATE NOW | Last update timestamp |

#### `company_members` — Company membership and access control

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT | PK, AUTO_INCREMENT | Membership record ID |
| companyId | INT | NOT NULL | References `companies.id` |
| email | VARCHAR(320) | NOT NULL | Member email (lowercase, used for invitation matching) |
| memberRole | ENUM('owner','member') | NOT NULL, DEFAULT 'member' | Role within the company |
| status | ENUM('active','pending') | NOT NULL, DEFAULT 'pending' | Membership activation status |
| userId | INT | NULLABLE | References `users.id` (set when member logs in) |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW | Invitation timestamp |
| updatedAt | TIMESTAMP | NOT NULL, ON UPDATE NOW | Last update timestamp |

#### `upload_records` — Video upload history

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT | PK, AUTO_INCREMENT | Record identifier |
| companyId | INT | NULLABLE | References `companies.id` |
| catalogId | VARCHAR(64) | NOT NULL | Facebook Catalog ID |
| retailerId | VARCHAR(255) | NOT NULL | Product retailer ID within the catalog |
| productName | VARCHAR(512) | NOT NULL | Product display name |
| productImageUrl | TEXT | NULLABLE | Product thumbnail URL |
| video4x5Download | TEXT | NULLABLE | 4:5 video download URL |
| video4x5Embed | TEXT | NULLABLE | 4:5 video embed URL (Facebook hosted) |
| video9x16Download | TEXT | NULLABLE | 9:16 video download URL |
| video9x16Embed | TEXT | NULLABLE | 9:16 video embed URL (Facebook hosted) |
| clientName | VARCHAR(255) | NOT NULL | Client/brand name |
| uploadTimestamp | TIMESTAMP | NOT NULL, DEFAULT NOW | When the upload occurred |
| uploadedBy | VARCHAR(255) | NULLABLE | Google email of the uploader |

**Deduplication Logic:** The `getAllUploadRecords()` query returns only the latest record per unique `(retailerId, catalogId)` combination using a `MAX(id) GROUP BY` subquery. This ensures the admin panel shows one row per product rather than duplicate entries from re-uploads.

#### `app_settings` — Key-value configuration store

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT | PK, AUTO_INCREMENT | Setting record ID |
| settingKey | VARCHAR(128) | NOT NULL, UNIQUE | Configuration key name |
| settingValue | TEXT | NULLABLE | Configuration value |
| updatedAt | TIMESTAMP | NOT NULL, ON UPDATE NOW | Last modification time |

---

## 8. Authentication & Authorization

The application uses a dual-authentication approach:

### 8.1 Google OAuth 2.0 (Primary — Upload Tool)

The main upload tool (`MainApp.tsx`) uses Google OAuth 2.0 for user authentication. This is implemented entirely on the client side using the Google Identity Services library.

**Flow:**

1. User clicks "Sign in with Google" on the upload page.
2. Google Identity Services library initiates the OAuth flow.
3. Upon successful authentication, the client receives an access token.
4. The client calls `https://www.googleapis.com/oauth2/v3/userinfo` to retrieve the user's profile (name, email, picture).
5. The user's email is matched against `company_members.email` to determine which companies they can access.
6. Pending memberships (`status = 'pending'`) are automatically activated upon first login.

**Implementation:** The `GoogleAuthContext.tsx` context provider manages the authentication state, token storage (localStorage), and automatic token refresh.

**Key Environment Variable:** `VITE_GOOGLE_CLIENT_ID` — The Google OAuth Client ID obtained from the Google Cloud Console.

### 8.2 Company Access Key (Secondary — Simple Password)

Each company can optionally set an `accessKey` (simple password) that members must enter to access the upload tool. This provides an additional layer of access control beyond Google OAuth.

### 8.3 Manus OAuth (Platform — Admin Panel)

The Manus platform provides its own OAuth system for the admin panel. This is handled by the `server/_core/oauth.ts` module and is specific to the Manus deployment. When migrating to other platforms, this should be replaced with Firebase Authentication or another provider (see `MIGRATION-FROM-MANUS.md`).

### 8.4 Authorization Model

| Resource | Access Control Method |
|----------|----------------------|
| Upload Tool (MainApp) | Google OAuth email + Company membership + Access Key |
| Admin Panel | Manus OAuth (platform-specific) |
| Company Settings | Company owner role (`memberRole = 'owner'`) |
| Facebook API Operations | Company-level Facebook Access Token |
| Video Log (Admin) | Manus OAuth admin access |

---

## 9. Backend API Reference

All API endpoints are defined as tRPC procedures in `server/routers.ts`. The tRPC router is mounted at `/api/trpc/*` on the Express server. All inputs are validated using Zod schemas.

### 9.1 Auth Router (`auth.*`)

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `auth.me` | Query | Public | Returns current authenticated user or null |
| `auth.logout` | Mutation | Public | Clears session cookie |

### 9.2 Company Router (`company.*`)

| Procedure | Type | Auth | Input | Description |
|-----------|------|------|-------|-------------|
| `company.create` | Mutation | Public | `{name, email, facebookAccessToken?, accessKey?}` | Create a new company; creator becomes owner |
| `company.get` | Query | Public | `{id}` | Get company by ID (token masked) |
| `company.getByEmail` | Query | Public | `{email}` | Get all companies where email is a member |
| `company.update` | Mutation | Public | `{id, name?, facebookAccessToken?, accessKey?, catalogs?}` | Update company settings; auto-checks token expiration |
| `company.getTokenExpiration` | Query | Public | `{id}` | Check Facebook token expiration status |
| `company.refreshTokenExpiration` | Mutation | Public | `{id}` | Re-check token expiration via Facebook debug_token API |
| `company.getAccessToken` | Query | Public | `{id}` | Get full (unmasked) Facebook access token |

### 9.3 Members Router (`members.*`)

| Procedure | Type | Auth | Input | Description |
|-----------|------|------|-------|-------------|
| `members.list` | Query | Public | `{companyId}` | List all members of a company |
| `members.invite` | Mutation | Public | `{companyId, email}` | Invite a member by email (status: pending) |
| `members.remove` | Mutation | Public | `{companyId, email}` | Remove a member from company |
| `members.activate` | Mutation | Public | `{email, userId?}` | Activate pending memberships for an email |

### 9.4 Uploads Router (`uploads.*`)

| Procedure | Type | Auth | Input | Description |
|-----------|------|------|-------|-------------|
| `uploads.create` | Mutation | Public | Upload record fields | Create a single upload record |
| `uploads.createBatch` | Mutation | Public | Array of upload records | Batch create upload records |
| `uploads.listByCatalog` | Query | Public | `{catalogId}` | List uploads for a specific catalog |
| `uploads.listByCompany` | Query | Public | `{companyId}` | List uploads for a specific company |
| `uploads.listAll` | Query | Public | None | List all uploads (deduplicated, latest per product) |
| `uploads.delete` | Mutation | Public | `{id}` | Delete an upload record |
| `uploads.uploadersByCompany` | Query | Public | `{companyId}` | Get uploader statistics by company |
| `uploads.allUploaders` | Query | Public | None | Get all uploader statistics |
| `uploads.deleteVideoFromCatalog` | Mutation | Public | `{id, companyId?}` | Remove video from Facebook Catalog via Batch API, then delete DB record |

### 9.5 Facebook Router (`facebook.*`)

| Procedure | Type | Auth | Input | Description |
|-----------|------|------|-------|-------------|
| `facebook.validateToken` | Mutation | Public | `{accessToken}` | Validate a Facebook access token via Graph API |
| `facebook.fetchCatalogName` | Mutation | Public | `{catalogId, accessToken}` | Fetch catalog display name from Facebook |

### 9.6 Settings Router (`settings.*`)

| Procedure | Type | Auth | Input | Description |
|-----------|------|------|-------|-------------|
| `settings.get` | Query | Public | `{key}` | Get a single setting value |
| `settings.set` | Mutation | Public | `{key, value}` | Set a setting value (upsert) |
| `settings.getAll` | Query | Public | None | Get all settings as key-value map |

---

## 10. Frontend Architecture

### 10.1 Page Components

The application has 4 main pages, routed via hash-based navigation (`window.location.hash`):

| Route | Component | Size | Description |
|-------|-----------|------|-------------|
| `#/` or `#/app` | `MainApp.tsx` | 45KB | Primary upload workflow — product selection, video attachment, batch upload |
| `#/admin` | `AdminPanel.tsx` | 81KB | Admin dashboard — video log, company/catalog/member management |
| `#/home` | `HomePage.tsx` | 2KB | Landing page with feature overview |
| `#/terms` | `TermsOfServicePage.tsx` | 4KB | Terms of service |

### 10.2 Key Components

| Component | File | Description |
|-----------|------|-------------|
| `GoogleDriveUploader` | `components/GoogleDriveUploader.tsx` | Google Drive file picker integration for video sourcing |
| `ProductTable` | `components/ProductTable.tsx` | Sortable, filterable product listing with checkbox selection |
| `ReelsOverlay` | `components/ReelsOverlay.tsx` | Preview overlay for Reels-format videos |
| `AppLayout` | `components/AppLayout.tsx` | Shared layout wrapper with header and footer |
| `AppFooter` | `components/AppFooter.tsx` | Footer with version info and links |
| `IntroGuide` | `components/IntroGuide.tsx` | First-time user onboarding guide |
| `LanguageSwitcher` | `components/LanguageSwitcher.tsx` | EN/ZH-TW language toggle |
| `ImagePreview` | `components/ImagePreview.tsx` | Product image preview modal |
| `Toast` | `components/Toast.tsx` | Toast notification system |

### 10.3 Context Providers

| Context | File | Purpose |
|---------|------|---------|
| `GoogleAuthContext` | `contexts/GoogleAuthContext.tsx` | Manages Google OAuth state, token, user profile |
| `LanguageContext` | `contexts/LanguageContext.tsx` | Manages i18n language selection (EN/ZH-TW) |
| `ThemeContext` | `contexts/ThemeContext.tsx` | Manages dark/light theme |

### 10.4 State Management

The application uses a combination of React state management approaches:

- **Server State:** TanStack React Query (via tRPC hooks) for all server data. Queries are automatically cached, deduplicated, and invalidated.
- **Local State:** React `useState` and `useReducer` for UI-specific state (form inputs, modal visibility, selection state).
- **Global State:** React Context for cross-cutting concerns (auth, language, theme).
- **Persistent State:** `localStorage` for Google OAuth tokens, language preference, and user settings.

---

## 11. Facebook Graph API Integration

The application integrates with the Facebook Graph API v21.0 for catalog product operations. All API calls are made from the server side to protect access tokens.

### 11.1 API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /v21.0/me` | GET | Validate access token and get user identity |
| `GET /v21.0/{catalog_id}?fields=name` | GET | Fetch catalog display name |
| `GET /v21.0/{catalog_id}/products?fields=id,retailer_id,name,image_url,video` | GET | List products in a catalog with video status |
| `POST /v21.0/{catalog_id}/items_batch` | POST | Batch update product videos (primary upload mechanism) |
| `GET /v21.0/debug_token?input_token={token}` | GET | Check token validity and expiration |
| `GET /v21.0/{catalog_id}/product_sets` | GET | List product sets within a catalog |
| `GET /v21.0/{product_set_id}/products` | GET | List products within a product set |

### 11.2 Batch API Upload Payload

The core upload operation uses the Facebook Catalog Batch API. Each batch request can update multiple products simultaneously.

```json
{
  "access_token": "EAA...",
  "item_type": "PRODUCT_ITEM",
  "requests": [
    {
      "method": "UPDATE",
      "data": {
        "id": "RETAILER_ID_123",
        "video": [
          {
            "url": "https://s3.amazonaws.com/bucket/video-4x5.mp4",
            "tag": "4:5 Product Video"
          }
        ]
      }
    }
  ]
}
```

**Important Notes:**
- The `id` field in the batch request refers to the `retailer_id` of the product, not the Facebook product ID.
- The `video` field accepts an array of video objects. Setting it to an empty array `[]` removes all videos from the product.
- Video URLs must be publicly accessible HTTPS URLs. The Facebook servers will download the video from this URL.
- The batch API is asynchronous — it returns a `handle` that can be used to check the status of the batch operation.

### 11.3 Token Management

Facebook access tokens have limited lifetimes. The application provides:

- **Automatic expiration checking:** When a token is saved, the app calls the `debug_token` endpoint to determine the expiration date and stores it in `companies.tokenExpiresAt`.
- **Manual refresh:** The `company.refreshTokenExpiration` procedure allows re-checking the token status.
- **Visual warnings:** The admin panel displays token expiration warnings when tokens are approaching expiry.
- **System User Tokens:** Tokens with `expires_at = 0` are treated as never-expiring (typically system user tokens from Business Manager).

### 11.4 Video Deletion Flow

When deleting a video from a catalog product:

1. Fetch the upload record from the database.
2. Get the company's Facebook access token.
3. Send a batch API request with `"video": []` to remove all videos from the product.
4. Wait 2 seconds for propagation.
5. Verify the product no longer has videos by re-fetching product data.
6. Delete the record from the database (always, even if Facebook API fails).

---

## 12. Google Drive Integration

The application supports sourcing video files from Google Drive, which is particularly useful for teams that store their product videos in shared Drive folders.

### 12.1 Implementation

The `GoogleDriveUploader.tsx` component uses the Google Picker API to allow users to select video files from their Google Drive. The flow is:

1. User clicks "Import from Google Drive."
2. The Google Picker UI opens, showing the user's Drive files filtered to video types.
3. User selects one or more video files.
4. The component retrieves the file metadata (name, size, mimeType) and a download URL.
5. The video URL is used directly in the Facebook Batch API upload (if the file is publicly shared) or proxied through the server.

### 12.2 Authentication

Google Drive access uses the same Google OAuth token obtained during user login. The token must have the `https://www.googleapis.com/auth/drive.readonly` scope to access Drive files.

---

## 13. Multi-Company Architecture

The application supports multiple companies, each with isolated credentials and catalog configurations. This allows a single deployment to serve multiple brands or business units.

### 13.1 Company Isolation

Each company has its own:
- **Facebook Access Token:** Stored in `companies.facebookAccessToken`. Different companies can connect to different Facebook Business accounts.
- **Catalog List:** Stored as a JSON array in `companies.catalogs`. Each company manages its own set of catalogs.
- **Access Key:** Optional password for the upload tool.
- **Member List:** Managed through the `company_members` table with role-based access (owner/member).

### 13.2 Member Invitation Flow

1. Company owner enters a new member's email address.
2. System creates a `company_members` record with `status = 'pending'`.
3. When the invited user logs in with Google OAuth using that email, the system calls `members.activate` to change the status to `'active'`.
4. The user can now see and access the company's catalogs and upload tools.

### 13.3 Data Segregation

Upload records are associated with a `companyId`, ensuring that each company's upload history is isolated. The admin panel can filter records by company.

---

## 14. File Storage (S3)

The application uses S3-compatible object storage for persisting video and image files. The storage layer is implemented in `server/storage.ts`.

### 14.1 Storage Operations

```typescript
import { storagePut } from "./server/storage";

// Upload a file to S3
const { url } = await storagePut(
  "videos/product-123-4x5.mp4",  // S3 key
  videoBuffer,                     // Buffer | Uint8Array | string
  "video/mp4"                      // Content-Type
);
// Returns: { key: "videos/...", url: "https://..." }
```

### 14.2 File Organization

| S3 Key Prefix | Content Type | Description |
|---------------|-------------|-------------|
| `slideshow-videos/` | video/mp4 | Uploaded product videos |
| `slideshow-proxy-images/` | image/* | Proxied product images from Facebook CDN |
| `slideshow-uploads/` | image/* | User-uploaded custom images |
| `slideshow-audio/` | audio/* | Background audio files |

### 14.3 Security

All S3 URLs are publicly accessible (no signing required). File keys include random suffixes to prevent enumeration attacks. The bucket is configured with appropriate CORS headers for browser-based access.

---

## 15. Admin Panel & Video Log

The admin panel (`AdminPanel.tsx`, 81KB) provides a comprehensive dashboard for managing the upload workflow.

### 15.1 Tabs

| Tab | Description |
|-----|-------------|
| **Video Log** | Deduplicated upload history with search, filter, date range, and XLSX export |
| **Company/Catalog/Member Management** | CRUD operations for companies, catalogs, and team members |

### 15.2 Video Log Features

The Video Log displays one row per unique product (deduplicated by `retailerId + catalogId`, showing only the latest upload). Each row includes:

- Product image thumbnail
- Product name
- Retailer ID
- Catalog ID (clickable link to Facebook Commerce Manager)
- Company name
- Client name
- 4:5 video status (play button or dash)
- 9:16 video status (play button or dash)
- Upload date and time
- Uploader email (Google login email)

**Filtering capabilities:**
- Text search (product name or retailer ID)
- Catalog dropdown filter
- Date range filter (start/end date)
- XLSX export with all visible columns

### 15.3 Statistics Cards

The top of the Video Log shows three summary cards:
- **Total Records:** Count of deduplicated upload records
- **Filtered Results:** Count after applying search/filter criteria
- **Catalogs:** Number of distinct catalogs with uploads

---

## 16. Internationalization (i18n)

The application supports two languages: English (EN) and Traditional Chinese (ZH-TW). The i18n system is implemented in `client/src/i18n.ts` using a simple key-value translation map.

### 16.1 Implementation

```typescript
// i18n.ts
const translations = {
  en: {
    home: "Home",
    adminPanel: "Admin Panel",
    uploadVideo: "Upload Video",
    // ... 100+ keys
  },
  "zh-TW": {
    home: "首頁",
    adminPanel: "管理面板",
    uploadVideo: "上傳影片",
    // ... 100+ keys
  },
};
```

The `LanguageContext` provider exposes a `t(key)` function that returns the translated string for the current language. Language preference is persisted in `localStorage`.

---

## 17. Testing Strategy

The application uses Vitest for unit and integration testing. Test files are co-located with the source code in the `server/` directory.

### 17.1 Test Files

| File | Tests | Description |
|------|-------|-------------|
| `auth.logout.test.ts` | 3 | Authentication logout flow |
| `cpv.test.ts` | 40+ | Core upload workflow, batch operations, company CRUD |
| `google-client-id.test.ts` | 2 | Google OAuth client ID validation |
| `token-expiration.test.ts` | 8 | Facebook token expiration checking |
| `uploaders.test.ts` | 5 | Uploader statistics queries |
| `video-log-dedup.test.ts` | 6 | Video log deduplication logic |

### 17.2 Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- server/cpv.test.ts

# Run tests in watch mode
pnpm test -- --watch
```

### 17.3 Test Configuration

Tests use Vitest with the following configuration:
- **Environment:** Node.js
- **Timeout:** 30 seconds (to accommodate Facebook API calls in integration tests)
- **Mocking:** Database queries are mocked using Vitest's `vi.mock()` for unit tests

---

## 18. Environment Variables

### 18.1 Required for All Deployments

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL/TiDB connection string | `mysql://user:pass@host:3306/dbname?ssl={"rejectUnauthorized":true}` |
| `JWT_SECRET` | Secret key for signing session cookies | Random 64-character string |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID for user login | `123456789.apps.googleusercontent.com` |

### 18.2 S3 Storage (Required for File Uploads)

| Variable | Description | Example |
|----------|-------------|---------|
| `S3_ENDPOINT` | S3-compatible endpoint URL | `https://s3.amazonaws.com` |
| `S3_REGION` | S3 bucket region | `us-east-1` |
| `S3_BUCKET` | S3 bucket name | `cpv-uploader-media` |
| `S3_ACCESS_KEY_ID` | S3 access key | AWS IAM access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key | AWS IAM secret key |
| `S3_PUBLIC_URL` | Public URL prefix for S3 objects | `https://cpv-uploader-media.s3.amazonaws.com` |

### 18.3 Manus Platform Only (Remove When Migrating)

These variables are injected automatically by the Manus platform and must be replaced with alternative implementations when deploying elsewhere:

| Variable | Manus Purpose | Migration Action |
|----------|--------------|-----------------|
| `VITE_APP_ID` | Manus OAuth application ID | Replace with Firebase/Auth0 config |
| `OAUTH_SERVER_URL` | Manus OAuth backend URL | Remove; use Firebase Auth |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL | Remove; use Firebase Auth |
| `OWNER_OPEN_ID` | Owner's Manus user ID | Remove or replace with admin email check |
| `OWNER_NAME` | Owner's display name | Remove |
| `BUILT_IN_FORGE_API_URL` | Manus internal API URL | Remove; not needed outside Manus |
| `BUILT_IN_FORGE_API_KEY` | Manus internal API key | Remove; not needed outside Manus |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus frontend API key | Remove |
| `VITE_FRONTEND_FORGE_API_URL` | Manus frontend API URL | Remove |
| `VITE_ANALYTICS_ENDPOINT` | Manus analytics endpoint | Remove or replace with Google Analytics |
| `VITE_ANALYTICS_WEBSITE_ID` | Manus analytics site ID | Remove or replace |
| `VITE_APP_LOGO` | Application logo URL | Set directly in code |
| `VITE_APP_TITLE` | Application title | Set directly in code |

---

## 19. Deployment Architecture

### 19.1 Current Deployment (Manus Platform)

The application is currently deployed on the Manus platform, which provides:
- Automatic HTTPS and domain management (`*.manus.space`)
- Built-in OAuth authentication
- Managed MySQL/TiDB database
- S3-compatible object storage
- CI/CD via checkpoint-based deployment

### 19.2 Alternative Deployment Options

For deployment outside the Manus platform, see `MIGRATION-FROM-MANUS.md` and `deploy-manus-to-cloudrun.md` for detailed guides. Supported targets include:

| Platform | Estimated Cost | Complexity |
|----------|---------------|------------|
| Google Cloud Run + Cloud SQL | $6-15/month | Medium |
| Railway | $5-20/month | Low |
| Docker Compose (self-hosted) | $5-10/month (VPS) | Medium |
| Vercel + PlanetScale | $0-25/month | Low |

### 19.3 Build Process

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:push

# Build for production
pnpm build
# Output: dist/ (server bundle) + dist/client/ (static assets)

# Start production server
node dist/index.js
```

The build process uses Vite for the frontend bundle and esbuild for the server bundle. The production server serves the static frontend assets and handles API requests.

---

## 20. Security Considerations

### 20.1 Token Security

- Facebook access tokens are stored in the database and never exposed to the frontend in full. The `company.get` endpoint returns masked tokens (`EAA...abc123`).
- The full token is only accessible via the `company.getAccessToken` endpoint, which should be restricted to authenticated users.
- Google OAuth tokens are stored in the browser's `localStorage` and are scoped to the minimum required permissions.

### 20.2 Input Validation

All tRPC procedure inputs are validated using Zod schemas. This prevents injection attacks and ensures data integrity. Examples:
- Email addresses are validated with `z.string().email()`
- Catalog IDs are validated as non-empty strings
- Numeric IDs are validated with `z.number()`
- URLs are validated with `z.string().url()`

### 20.3 Access Control Gaps

The current implementation uses `publicProcedure` for most endpoints, meaning any authenticated user can access any company's data. This is acceptable for the current use case (internal tool with trusted users) but should be hardened for public deployment by:

1. Adding company membership checks to all company-specific procedures.
2. Implementing rate limiting on Facebook API proxy endpoints.
3. Adding CSRF protection for mutation endpoints.
4. Restricting the `company.getAccessToken` endpoint to company owners only.

### 20.4 Data Protection

- Database connections use TLS/SSL (`ssl={"rejectUnauthorized":true}` in the connection string).
- S3 file keys include random suffixes to prevent URL enumeration.
- Session cookies use `httpOnly`, `secure`, and `sameSite` flags.

---

## 21. Build & Development Guide

### 21.1 Prerequisites

- Node.js 22+
- pnpm (latest)
- MySQL 8.0+ or TiDB
- S3-compatible storage (AWS S3, MinIO, Cloudflare R2)
- Google Cloud Console project (for OAuth Client ID)
- Facebook Developer account (for Graph API access)

### 21.2 Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/william0348/Catalog-Product-Video-Uploader.git
cd Catalog-Product-Video-Uploader

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your database URL, S3 credentials, Google Client ID, etc.

# 4. Run database migrations
pnpm db:push

# 5. Start development server
pnpm dev
# Server starts at http://localhost:3000 (or next available port)
```

### 21.3 Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `pnpm dev` | Start development server with hot reload |
| `build` | `pnpm build` | Build for production (Vite + esbuild) |
| `test` | `pnpm test` | Run all Vitest tests |
| `db:push` | `pnpm db:push` | Generate and run database migrations |
| `format` | `pnpm format` | Format code with Prettier |
| `lint` | `pnpm lint` | Run ESLint |

### 21.4 Adding a New Feature (Step-by-Step)

1. **Schema:** Add or modify tables in `drizzle/schema.ts`.
2. **Migrate:** Run `pnpm db:push` to apply schema changes.
3. **Query Helpers:** Add database functions in `server/db.ts`.
4. **API Procedures:** Add tRPC procedures in `server/routers.ts`.
5. **Frontend:** Create or update page components in `client/src/pages/`.
6. **Tests:** Write Vitest tests in `server/*.test.ts`.
7. **Verify:** Run `pnpm test` and check the browser.

---

## 22. Known Limitations & Future Roadmap

### 22.1 Current Limitations

| Limitation | Impact | Potential Solution |
|------------|--------|-------------------|
| All procedures use `publicProcedure` | Any authenticated user can access any company | Add company membership middleware |
| Facebook token stored as plain text | Security risk if database is compromised | Encrypt tokens at rest using AES-256 |
| No rate limiting on API endpoints | Vulnerable to abuse | Add Express rate limiting middleware |
| Hash-based routing (`#/`) | Not SEO-friendly | Migrate to `wouter` or React Router with history mode |
| No real-time upload progress | Users see batch completion only | Add WebSocket or SSE for progress updates |
| Single-region deployment | Higher latency for global users | Deploy to multiple regions with CDN |

### 22.2 Future Roadmap

**Q2 2026:**
- Implement per-company access control middleware.
- Add WebSocket-based real-time upload progress.
- Integrate Facebook Webhooks for batch status callbacks.

**Q3 2026:**
- Multi-region deployment with edge caching.
- Automated token refresh using Facebook long-lived tokens.
- Bulk video management dashboard (preview, replace, delete).

**Q4 2026:**
- API-first architecture for third-party integrations.
- Automated video quality validation before upload.
- Analytics dashboard for upload success rates and video performance metrics.

---

## References

- [Facebook Graph API — Catalog Batch API](https://developers.facebook.com/docs/marketing-api/catalog-batch)
- [Facebook Graph API — Product Items](https://developers.facebook.com/docs/commerce-platform/catalog/product-items)
- [Google Identity Services — OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [tRPC Documentation](https://trpc.io/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Vite Documentation](https://vitejs.dev/guide/)
- [TanStack React Query](https://tanstack.com/query/latest)
