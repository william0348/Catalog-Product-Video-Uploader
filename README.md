# CPV Uploader

**Meta CPAS Video Upload Tool for Brands and Retailers**

CPV Uploader is a web-based tool designed for brands and retailers running **Meta Collaborative Performance Advertising Solution (CPAS)** campaigns. It streamlines the process of uploading product-level video (PLV) ads to Facebook/Instagram product catalogs, enabling dynamic video creatives across Advantage+ catalog ads, Reels placements, and collaborative ad campaigns.

---

## Overview

Meta CPAS allows brands and retail marketplaces to collaborate on targeted Facebook and Instagram ads by sharing product catalog segments. While Meta supports video creatives at the product level, manually uploading videos to each product in a catalog is time-consuming and error-prone, especially for catalogs containing thousands of SKUs.

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
| `users` | User accounts linked to Manus OAuth, with role-based access (admin/user) |
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

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session cookie signing secret |
| `VITE_APP_ID` | Application identifier |

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

Built with the [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis/) and [Google APIs](https://developers.google.com/). Designed for the RhinoShield x Meta CPAS partnership workflow.
