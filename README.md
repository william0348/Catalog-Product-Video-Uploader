# CPV Uploader

**Meta Catalog Product Video Uploader**

CPV Uploader is a web-based tool designed for brands and retailers who manage **Meta (Facebook/Instagram) product catalogs**. It streamlines the process of uploading product-level videos to catalog items, enabling dynamic video creatives across Advantage+ catalog ads, Reels placements, and collaborative ad campaigns.

---

## Important: Manus Platform Integration

This project was originally built and deployed on the **Manus AI platform**, which provides a built-in OAuth login system, S3 storage proxy, and various internal services. If you are cloning this repository to run independently outside of Manus, you will need to remove or replace several Manus-specific components.

We provide **comprehensive documentation** to help you through this process:

| Document | Description |
|----------|-------------|
| [`TECHNICAL-DOCUMENT.md`](./TECHNICAL-DOCUMENT.md) | **Complete technical document** (22 chapters). Covers system architecture, database design (5 tables with ER diagram), all 27+ tRPC API endpoints, frontend architecture, Facebook Graph API integration, Google Drive integration, multi-company architecture, security considerations, and build/development guide. |
| [`MIGRATION-FROM-MANUS.md`](./MIGRATION-FROM-MANUS.md) | **Comprehensive migration guide** (22 chapters, 1600+ lines). Covers all 17 Manus-specific modules, complete database structure (6 tables with DDL), environment variable classification (Manus-only vs general-purpose), Firebase Auth integration guide, `.env.example` template, file handling checklist, and deployment options for Cloud Run, Docker Compose, Railway, and Vercel. |
| [`migrate-from-manus.md`](./migrate-from-manus.md) | **Quick-start skill for AI agents**. A concise, actionable checklist designed for other AI agents or developers who need to quickly identify and fix Manus-specific code. Covers the 10 most critical modifications with exact code snippets for each fix. |
| [`BUILD-FROM-SCRATCH.md`](./BUILD-FROM-SCRATCH.md) | **Build from scratch guide** (20 chapters). A comprehensive step-by-step guide to rebuild the entire system from zero, designed for both human engineers and AI vibe-coding tools (Cursor, Windsurf, Bolt, v0). Covers business context, database schema, Google OAuth, Facebook Graph API, Google Drive integration, multi-company architecture, admin panel, i18n, and deployment. |
| [`deploy-manus-to-cloudrun.md`](./deploy-manus-to-cloudrun.md) | **Google Cloud Run deployment guide**. Step-by-step instructions for deploying this app to Cloud Run with Cloud SQL. |

The current deployment already uses Google Login for user authentication and Google Drive integration. The Manus Login layer is only used for the platform's internal session management and can be safely replaced.

---

## Overview

Meta supports video creatives at the product level in its product catalogs, but manually uploading videos to each product is time-consuming and error-prone, especially for catalogs containing thousands of SKUs. Even when videos are uploaded manually through Commerce Manager, they get replaced every time the data feed updates.

CPV Uploader solves this by providing a unified interface that connects directly to the **Facebook Graph API**, allowing users to browse product catalogs, match videos to products, and upload them in bulk with a single workflow. The tool supports both **4:5** (feed) and **9:16** (Reels/Stories) aspect ratios, with all upload records stored in a **MySQL database** and video files managed via **Google Drive** integration.

---

## Key Features

### Product Catalog Browser

The tool connects to the Facebook Marketing API to fetch product catalogs associated with a Business Manager account. Users can browse products with image previews, filter by product sets, search by name or retailer ID, and filter by video upload status. The product table displays each product's image, name, retailer ID, and current video status for both aspect ratios.

### Bulk Video Upload

Users can upload videos to multiple products simultaneously. The upload engine handles the Facebook Graph API's asynchronous video upload flow, including polling for encoding completion. Videos are uploaded with proper aspect ratio metadata and associated with the correct product via the retailer ID. The tool supports drag-and-drop file selection and provides real-time progress tracking for each upload.

### Upload Record Management

Every successful upload is automatically recorded in the database, creating a persistent history of all video assignments. Records capture the catalog ID, retailer ID, product name, video URLs (both download and embed), client name, timestamp, and the uploader's email. The admin panel provides a searchable upload history view.

### Google Drive Integration

Videos can be sourced directly from Google Drive folders. The Google Drive uploader component allows users to browse their Drive, select video files, and upload them to product catalogs without downloading files locally first.

### Multi-Company Support

The tool supports multiple companies (brands/retailers) under a single deployment. Each company has its own Facebook Access Token, catalog configurations, and access credentials. Users are associated with companies via email-based membership, and company settings are stored server-side in a MySQL database.

### Admin Panel

An administrative interface provides company management capabilities including creating companies, inviting members by email, managing Facebook Access Tokens, configuring catalogs, and viewing upload history. The admin panel also includes a member management system with owner and member roles.

### Internationalization

The interface supports both **English** and **Traditional Chinese** (繁體中文), with language selection persisted across sessions. All UI text, error messages, and labels are translated.

---

## Architecture

CPV Uploader is built as a full-stack TypeScript application with the following technology stack:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19 + TypeScript | Single-page application with component-based UI |
| Styling | Tailwind CSS 4 | Utility-first CSS framework |
| UI Components | shadcn/ui + Radix UI | Accessible, composable component library |
| State Management | TanStack React Query | Server state synchronization and caching |
| API Layer | tRPC 11 | End-to-end type-safe API communication |
| Backend | Express 4 + Node.js | HTTP server with tRPC adapter |
| Database | MySQL (TiDB) | Persistent storage for companies, members, settings, and upload records |
| ORM | Drizzle ORM | Type-safe database queries and schema management |
| Authentication | Google OAuth 2.0 | User authentication via Google accounts |
| External APIs | Facebook Graph API v23.0 | Product catalog access and video uploads |
| File Storage | AWS S3 | Video and image asset storage |
| Video Processing | FFmpeg (fluent-ffmpeg) | Server-side video generation and processing |

### Project Structure

```
cpv-uploader/
├── client/
│   ├── src/
│   │   ├── pages/           # Page-level components (MainApp, AdminPanel, etc.)
│   │   ├── components/      # Reusable UI components
│   │   ├── contexts/        # React contexts (Language, Theme)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utility libraries (tRPC client, helpers)
│   │   ├── api.ts           # Facebook Graph API client
│   │   ├── settingsStore.ts # Settings management (local + server)
│   │   ├── i18n.ts          # Internationalization translations
│   │   ├── constants.ts     # Application constants
│   │   └── types.ts         # TypeScript type definitions
│   └── public/              # Static assets (favicon, robots.txt)
├── server/
│   ├── _core/               # Framework plumbing (OAuth, context, Vite bridge)
│   ├── routers.ts           # tRPC procedure definitions
│   ├── db.ts                # Database query helpers
│   ├── slideshow.ts         # Video generation engine
│   └── storage.ts           # S3 storage helpers
├── drizzle/
│   ├── schema.ts            # Database table definitions
│   └── relations.ts         # Table relationship definitions
└── shared/                  # Shared constants and types
```

---

## Data Model

The application uses five primary database tables:

| Table | Description |
|-------|-------------|
| `users` | User accounts (originally linked to Manus OAuth, should be replaced with your own auth provider), with role-based access (admin/user) |
| `companies` | Brand/retailer organizations with Facebook tokens and catalog configurations |
| `company_members` | Email-based membership linking users to companies (owner/member roles) |
| `upload_records` | Historical log of all video uploads with product metadata and video URLs |
| `app_settings` | Key-value store for application-wide configuration |

---

## Facebook Graph API Integration

The tool interacts with the following Facebook Graph API endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/{catalog_id}/products` | GET | Fetch products from a catalog with pagination |
| `/{catalog_id}/product_sets` | GET | List product sets within a catalog |
| `/{product_set_id}/products` | GET | Fetch products belonging to a specific product set |
| `/{catalog_id}/product_feeds` | GET | Retrieve product feed information |
| `/{product_id}/videos` | POST | Upload a video to a specific product |
| `/debug_token` | GET | Validate Facebook Access Token |

All API calls use the Graph API **v23.0** and require a valid User or System User Access Token with `catalog_management` and `business_management` permissions.

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- MySQL 8+ or TiDB database
- Facebook Business Manager account with catalog access
- Google Cloud project with OAuth 2.0 credentials (for Drive integration)

### Installation

```bash
git clone <repository-url>
cd cpv-uploader
pnpm install
```

### Environment Variables

The following environment variables are required:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | MySQL/TiDB connection string | **Yes** |
| `JWT_SECRET` | Session cookie signing secret (generate with `openssl rand -base64 32`) | **Yes** |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID (for authentication and Drive integration) | **Yes** |
| `VITE_APP_TITLE` | Website title | Optional |
| `VITE_APP_LOGO` | Website logo URL | Optional |

> **Note**: `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, and other Manus-specific variables are **not needed** when running outside of Manus. See [`MIGRATION-FROM-MANUS.md` Section 18](./MIGRATION-FROM-MANUS.md#18-環境變數對照表) for the complete environment variable reference.

### Database Setup

```bash
pnpm db:push
```

This command generates and runs Drizzle migrations to create the required database tables.

### Development

```bash
pnpm dev
```

The development server starts with hot module replacement enabled. The frontend is served via Vite and the backend runs with `tsx watch` for automatic reloading.

### Build

```bash
pnpm build
```

Produces an optimized production build with Vite for the frontend and esbuild for the backend.

### Testing

```bash
pnpm test
```

Runs the Vitest test suite covering server-side logic, API endpoints, and video generation.

---

## Usage Workflow

1. **Authenticate** with Google OAuth to enable Drive integration and user identification.
2. **Select a company** (if multiple are configured) to load the associated Facebook token and catalogs.
3. **Choose a catalog** from the dropdown to browse its products.
4. **Filter products** by product set, search term, stock status, or video upload status.
5. **Select products** and assign video files (4:5 and/or 9:16 aspect ratios).
6. **Upload videos** in bulk. The tool handles the Facebook API upload flow and polls for completion.
7. **Review results** in the product table or the admin panel upload history.

---

## License

MIT

---

## Acknowledgments

Built on the [Manus AI platform](https://manus.im) with the [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis/) and [Google APIs](https://developers.google.com/). Designed for Meta Catalog product video management workflows.
