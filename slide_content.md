# CPV Video Uploader — Technical Architecture Deck
## How to Build a Meta Catalog Product Video Tool from Scratch

Visual style: Clean, modern tech-startup aesthetic. Use a dark navy (#0F172A) primary background with white text, accented by Meta blue (#0668E1) and green (#22C55E) highlights. Use monospace font for code/technical terms. Minimalist icons and diagrams. Professional but approachable for both marketing and engineering audiences.

---

## Slide 1: Title Slide
**CPV Video Uploader**
Building a Meta Catalog Product Video Tool from Scratch

A technical deep-dive for Marketing & Engineering teams

RhinoShield × Meta Collaborative Ads

---

## Slide 2: The Problem — Why This Tool Exists
**Manual video uploads to Meta catalogs cost 15+ minutes per product**

Meta supports product-level video creatives in catalogs for Advantage+ ads, Reels, and Stories placements. However, the current workflow has critical pain points:

- Commerce Manager only allows uploading one video per product at a time — no bulk operations
- Every time a product data feed updates (daily/weekly), manually uploaded videos get overwritten and lost
- Brands managing 1,000+ SKUs across multiple catalogs cannot scale manual uploads
- Two aspect ratios required: 4:5 (Feed) and 9:16 (Reels/Stories) — doubling the work
- No centralized record of which products have videos, who uploaded them, or when

This tool reduces the per-product upload time from 15 minutes to under 10 seconds.

---

## Slide 3: The Solution — What CPV Uploader Does
**One unified interface connecting Google Drive, Facebook Graph API, and a video engine**

CPV Uploader is a full-stack web application that provides five core capabilities:

1. **Catalog Browser** — Connect to any Meta product catalog via Graph API, browse products with image previews, filter by product set, search by name or retailer ID
2. **Bulk Video Upload** — Select multiple products, assign video files (4:5 and/or 9:16), and upload them all in one batch via the Facebook Graph API
3. **Google Drive Integration** — Source videos directly from Google Drive folders without downloading locally
4. **Slideshow Video Generator** — Auto-generate product videos from catalog images with transitions, text overlays, and background music using FFmpeg
5. **Upload Record Management** — Every upload is logged in a MySQL database with product metadata, video URLs, uploader email, and timestamp

---

## Slide 4: User Workflow — From Login to Upload in 7 Steps
**The end-to-end user journey takes under 3 minutes for bulk uploads**

Step 1: Sign in with Google OAuth (authenticates user and enables Drive access)
Step 2: Select a company profile (loads the associated Facebook Access Token and catalogs)
Step 3: Choose a catalog from the dropdown menu
Step 4: Browse and filter products (by product set, search term, stock status, or video status)
Step 5: Select target products and assign video files — either upload from local device, pick from Google Drive, or generate a slideshow video
Step 6: Click "Upload" — the tool handles Facebook's async video upload flow with progress tracking
Step 7: Review results in the product table or admin panel upload history

---

## Slide 5: System Architecture Overview
**A full-stack TypeScript monorepo with 4 external integrations**

The system architecture consists of three layers connected to four external services:

Frontend Layer (React 19 + Tailwind CSS 4):
- Single-page application with shadcn/ui components
- tRPC client for type-safe API calls
- Google Identity Services for OAuth
- Real-time upload progress tracking

Backend Layer (Express 4 + tRPC 11 + Node.js):
- tRPC procedures as the API contract
- Drizzle ORM for database queries
- FFmpeg for server-side video generation
- S3 SDK for file storage

Data Layer (MySQL + S3):
- MySQL database: 6 tables (users, companies, company_members, upload_records, app_settings, slideshow_templates)
- S3 bucket: video files, slideshow assets, proxy-cached images

External APIs:
- Facebook Graph API v23.0 (catalog access, video upload)
- Google OAuth 2.0 (authentication, Drive access)
- Google Drive API (video file sourcing)
- AWS S3 (file storage)

---

## Slide 6: Technology Stack — Why These Choices
**Every technology choice optimizes for type safety, developer velocity, and deployment simplicity**

| Layer | Technology | Why This Choice |
|-------|-----------|----------------|
| Language | TypeScript (end-to-end) | Single language for frontend + backend, shared types eliminate API contract bugs |
| Frontend | React 19 | Component-based UI, massive ecosystem, team familiarity |
| Styling | Tailwind CSS 4 | Utility-first approach, rapid prototyping, consistent design tokens |
| UI Library | shadcn/ui + Radix | Accessible, composable, copy-paste components (not a dependency) |
| API Layer | tRPC 11 | Zero-codegen type safety — change a server procedure, frontend auto-updates |
| Server | Express 4 | Battle-tested HTTP framework, tRPC adapter available |
| Database | MySQL (TiDB compatible) | ACID transactions, JSON support, managed hosting options |
| ORM | Drizzle | Lightweight, type-safe, SQL-like syntax, fast migrations |
| Video | FFmpeg (fluent-ffmpeg) | Industry-standard video processing, supports all codecs and transitions |
| Storage | AWS S3 | Scalable object storage, CDN-compatible, presigned URLs |

---

## Slide 7: Database Schema — 6 Tables Powering the Application
**A normalized schema designed for multi-company, multi-user catalog management**

Table 1: `users` (Authentication)
- Stores user accounts linked to Google OAuth
- Fields: id, openId (auth provider ID), email, name, role (admin/user), timestamps

Table 2: `companies` (Organization)
- Each company has its own Facebook Access Token and catalog list
- Fields: id, name, facebookAccessToken, catalogs (JSON array), accessKey, tokenExpiresAt

Table 3: `company_members` (Access Control)
- Email-based invitation system with owner/member roles
- Fields: id, companyId, email, memberRole (owner/member), status (active/pending), userId

Table 4: `upload_records` (Core Business Data)
- Every video upload is logged with full metadata
- Fields: id, companyId, catalogId, retailerId, productName, productImageUrl, video4x5Download, video4x5Embed, video9x16Download, video9x16Embed, clientName, uploadTimestamp, uploadedBy

Table 5: `app_settings` (Configuration)
- Key-value store for application-wide settings

Table 6: `slideshow_templates` (Video Generation)
- Saved templates for the slideshow video generator with all rendering parameters

---

## Slide 8: Facebook Graph API Integration — The Core Engine
**5 API endpoints power the catalog browsing and video upload workflow**

The tool interacts with Facebook Graph API v23.0 using these endpoints:

1. `GET /{catalog_id}/products` — Fetch products with pagination, returns image URLs, retailer IDs, names, and existing video status
2. `GET /{catalog_id}/product_sets` — List product sets within a catalog for filtering
3. `GET /{product_set_id}/products` — Fetch products belonging to a specific product set
4. `POST /{product_id}/videos` — Upload a video file to a specific product (async operation)
5. `POST /{catalog_id}/items_batch` — Batch API for updating/removing product videos

Key technical considerations:
- All calls require a User or System User Access Token with `catalog_management` and `business_management` permissions
- Video uploads are asynchronous — the tool polls for encoding completion status
- Facebook CDN image URLs expire, so the tool proxy-caches product images to S3
- Token expiration is auto-detected via `debug_token` endpoint and displayed in the admin panel

---

## Slide 9: Video Upload Flow — Async Processing with Progress Tracking
**A 6-step async pipeline handles Facebook's video encoding workflow**

Step 1: User selects products and assigns video files (local upload, Google Drive, or generated slideshow)
Step 2: Frontend sends video data to the backend via tRPC mutation
Step 3: Backend uploads the video file to S3 storage (generates a public URL)
Step 4: Backend calls `POST /{product_id}/videos` with the S3 video URL
Step 5: Facebook begins async video encoding — backend polls the encoding status every 2 seconds
Step 6: On completion, the upload record is saved to MySQL with all metadata (video URLs, timestamps, uploader info)

Error handling:
- Retry logic with exponential backoff for transient failures
- If Facebook API fails, the database record is still created with error status
- Token validation before upload to prevent wasted processing time

---

## Slide 10: Slideshow Video Generator — FFmpeg-Powered Video Creation
**Auto-generate product videos from catalog images with zero video editing skills**

The slideshow generator creates professional product videos from static product images:

Input: Array of product image URLs + configuration parameters
Output: MP4 video file uploaded to S3

Configurable parameters:
- Aspect ratio: 4:5 (Feed) or 9:16 (Reels/Stories)
- Duration per image: 1–30 seconds
- Transitions: fade, slide (4 directions), wipe (2 directions), none
- Text overlay: product name, custom text, configurable font/size/color/position
- Background color and image scaling/offset
- Overlay image (logo/watermark) with position and scale controls
- Background music with volume control

Technical implementation:
- Server-side FFmpeg processing via fluent-ffmpeg
- Images are proxy-cached from Facebook CDN to S3 (prevents URL expiration during rendering)
- Templates can be saved and reused across products
- Generated videos are uploaded to S3 and returned as public URLs

---

## Slide 11: Google Drive Integration — Seamless Video Sourcing
**Users can pick videos directly from their Google Drive without downloading**

The Google Drive integration uses Google Identity Services (GIS) for authentication and the Google Drive API v3 for file access:

Authentication flow:
1. User clicks "Sign in with Google" — triggers OAuth popup
2. Scopes requested: `drive.readonly` (read-only access to Drive files)
3. Access token stored in React context for subsequent API calls

File browsing:
- Users can navigate their Drive folder structure
- Filter by video file types (mp4, mov, avi, webm)
- Preview video thumbnails before selection

Upload flow:
1. User selects a video file from Drive
2. Frontend fetches the file content via Drive API download endpoint
3. File is sent to the backend for S3 upload and Facebook API submission

This eliminates the need to download large video files to the user's local machine before uploading to Meta catalogs.

---

## Slide 12: Multi-Company Architecture — Isolated Credentials per Brand
**Each company operates with its own Facebook token, catalogs, and team members**

The multi-company system supports agencies and teams managing multiple brands:

Company isolation:
- Each company has its own Facebook Access Token (stored encrypted in the database)
- Catalog configurations are stored per company as JSON arrays
- Upload records are tagged with companyId for filtering

Team management:
- Email-based invitation system — owners invite members by email address
- Two roles: Owner (full access, can manage settings) and Member (upload access only)
- Pending status: invited members are auto-activated when they first log in with the matching email
- Members can belong to multiple companies

Token management:
- Token expiration is auto-detected via Facebook's `debug_token` endpoint
- Admin panel displays token status with expiration date
- Manual token refresh available for System User tokens (which never expire)

---

## Slide 13: Frontend Architecture — Component Structure
**A modular React application with 4 main pages and 15+ reusable components**

Page components:
1. `MainApp.tsx` (45KB) — The primary workspace: catalog browser, product table, video upload interface, Google Drive integration
2. `AdminPanel.tsx` (81KB) — Company management, upload history (Video Log), member management, settings
3. `SlideshowGenerator.tsx` (121KB) — Full-featured video creation studio with live preview, template management, and batch generation
4. `HomePage.tsx` — Landing page with company selection and Google login

Key reusable components:
- `ProductTable.tsx` — Sortable, filterable product grid with video status indicators
- `GoogleDriveUploader.tsx` — Drive file browser and selector
- `ReelsOverlay.tsx` — Visual overlay editor for slideshow videos
- `AppLayout.tsx` — Shared navigation header and footer
- `LanguageSwitcher.tsx` — EN/繁中 toggle with persistent selection

State management:
- TanStack React Query for server state (caching, invalidation, optimistic updates)
- React Context for auth state (Google OAuth) and language preferences
- Local state for UI interactions (modals, selections, filters)

---

## Slide 14: Backend API Design — tRPC Procedures
**855 lines of type-safe API procedures organized into 7 router modules**

Router modules and their procedure counts:

1. `auth` (2 procedures) — me (get current user), logout
2. `company` (7 procedures) — create, get, getByEmail, update, getTokenExpiration, refreshTokenExpiration, getAccessToken
3. `members` (3 procedures) — list, invite, remove, activate
4. `uploads` (7 procedures) — create, createBatch, listByCatalog, listByCompany, listAll, delete, deleteVideoFromCatalog
5. `facebook` (2 procedures) — validateToken, fetchCatalogName
6. `slideshow` (10 procedures) — fetchProducts, fetchProductSets, generate, proxyUploadImage, proxyUploadImages, uploadImage, uploadGeneratedVideo, uploadAudio, updateCatalogVideo, fonts
7. `slideshowTemplate` (4 procedures) — list, getById, create, update, delete
8. `settings` (3 procedures) — get, set, getAll

Total: ~38 tRPC procedures covering all business operations

---

## Slide 15: Build Steps — How to Recreate This from Scratch
**A 10-phase development roadmap from zero to production**

Phase 1: Project Scaffolding (Day 1)
- Initialize TypeScript monorepo with Vite + Express + tRPC
- Set up Tailwind CSS 4, shadcn/ui, and Drizzle ORM
- Configure MySQL database connection and run initial migrations

Phase 2: Authentication (Day 2)
- Implement Google OAuth 2.0 with Firebase Authentication (free tier)
- Create user table and session management
- Build login/logout UI with protected routes

Phase 3: Company Management (Day 3)
- Design companies and company_members tables
- Build CRUD API for company settings
- Implement email-based invitation system

Phase 4: Facebook Graph API Integration (Day 4–5)
- Implement catalog product fetching with pagination
- Build product set filtering and search
- Create token validation and expiration monitoring

Phase 5: Video Upload Engine (Day 6–7)
- Implement async video upload to Facebook Graph API
- Build progress tracking with polling
- Create upload record logging to database

Phase 6: Google Drive Integration (Day 8)
- Integrate Google Identity Services for Drive access
- Build Drive file browser component
- Implement file download and S3 upload pipeline

Phase 7: Slideshow Video Generator (Day 9–11)
- Set up FFmpeg on the server
- Implement image-to-video pipeline with transitions
- Build template system for saved configurations
- Add text overlay, background music, and logo watermark support

Phase 8: Admin Panel (Day 12–13)
- Build upload history view with search and filters
- Implement company settings management UI
- Add member management interface

Phase 9: Polish & i18n (Day 14)
- Add English and Traditional Chinese translations
- Implement responsive design for mobile
- Add error handling, loading states, and empty states

Phase 10: Deployment (Day 15)
- Containerize with Docker
- Deploy to Google Cloud Run (or Railway/Vercel)
- Set up MySQL database (PlanetScale, TiDB, or Cloud SQL)
- Configure S3 bucket for file storage

---

## Slide 16: Key Technical Decisions & Trade-offs
**Architectural choices that shaped the tool's capabilities and limitations**

Decision 1: tRPC over REST
- Pro: Zero-codegen type safety, automatic client generation, Superjson serialization
- Trade-off: Tightly couples frontend and backend (not ideal for public APIs)
- Verdict: Perfect for internal tools where both sides are TypeScript

Decision 2: Server-side FFmpeg over browser-based video generation
- Pro: Consistent output quality, access to all FFmpeg codecs, no browser memory limits
- Trade-off: Higher server costs, longer processing time for large batches
- Verdict: Worth it for production-quality video output

Decision 3: Google Drive as video source (not direct upload only)
- Pro: Teams can organize videos in shared Drive folders, no file size limits from browser
- Trade-off: Requires additional OAuth scope, adds complexity
- Verdict: Essential for teams managing hundreds of video assets

Decision 4: Multi-company architecture from day one
- Pro: Supports agencies managing multiple brands, clean data isolation
- Trade-off: Added complexity in every query and UI component
- Verdict: Critical for the target use case (agency/brand collaboration)

---

## Slide 17: Infrastructure & Deployment
**Production-ready deployment on Google Cloud Run with managed database**

Recommended production stack:

| Component | Service | Cost Estimate |
|-----------|---------|--------------|
| Application Server | Google Cloud Run | ~$5–20/month (scales to zero) |
| Database | TiDB Serverless or PlanetScale | Free tier available (5GB) |
| File Storage | AWS S3 or Cloudflare R2 | ~$1–5/month (R2 has free egress) |
| Authentication | Firebase Auth (Spark Plan) | Free (50K MAU) |
| Domain + SSL | Cloudflare | Free |
| Video Processing | FFmpeg on Cloud Run | Included in compute cost |

Total estimated cost: $6–25/month for typical usage

Docker deployment:
- Multi-stage Dockerfile: build stage (Vite + esbuild) → production stage (Node.js 22 Alpine)
- Environment variables for all secrets (DATABASE_URL, JWT_SECRET, Google Client ID, S3 credentials)
- Health check endpoint at /api/trpc for container orchestration

---

## Slide 18: Security Considerations
**Protecting Facebook tokens, user data, and API access**

Token security:
- Facebook Access Tokens are stored server-side only, never exposed to the frontend
- Tokens are masked in API responses (first 10 + last 6 characters shown)
- Token expiration is monitored and displayed in the admin panel

Authentication:
- Google OAuth 2.0 with Firebase ID Token verification on every API request
- JWT session cookies with HttpOnly and Secure flags
- Role-based access control (admin vs. user)

API security:
- All Facebook Graph API calls are proxied through the backend
- Input validation on every tRPC procedure via Zod schemas
- File upload size limits enforced (10MB images, 100MB videos, 16MB audio)

Data protection:
- S3 file keys include random suffixes to prevent enumeration
- Database queries are parameterized via Drizzle ORM (no SQL injection)
- CORS configured for production domain only

---

## Slide 19: Metrics & Impact
**Quantifying the value of automation over manual workflows**

| Metric | Manual (Commerce Manager) | CPV Uploader | Improvement |
|--------|--------------------------|--------------|-------------|
| Time per product video upload | 15 minutes | 10 seconds | 90x faster |
| Bulk upload (100 products) | 25 hours | 15 minutes | 100x faster |
| Video survives feed update | No (overwritten) | Yes (API-level) | Permanent |
| Upload history tracking | None | Full audit trail | New capability |
| Multi-brand management | Separate logins | Single dashboard | Unified |
| Video generation from images | External tool needed | Built-in | Integrated |
| Supported aspect ratios | Manual per ratio | Both in one flow | 2x efficiency |

---

## Slide 20: Summary & Next Steps
**A production-ready tool built in 15 development days with $6–25/month operating cost**

What we built:
- Full-stack TypeScript application with React 19, Express 4, tRPC 11, and MySQL
- 5 core features: Catalog Browser, Bulk Upload, Google Drive, Slideshow Generator, Admin Panel
- 38 type-safe API procedures across 7 router modules
- 6 database tables with multi-company, multi-user architecture
- Bilingual UI (English + Traditional Chinese)

Key takeaways for Engineering:
- tRPC eliminates API contract bugs between frontend and backend
- Server-side FFmpeg enables production-quality video generation
- Drizzle ORM provides type-safe database access with minimal overhead

Key takeaways for Marketing:
- 90x faster video uploads compared to manual Commerce Manager workflow
- Videos persist through feed updates (API-level upload vs. manual override)
- Built-in slideshow generator eliminates dependency on video editing tools
- Full audit trail of all uploads for compliance and reporting

Next steps:
1. Expand to support Instagram Shopping catalogs
2. Add scheduled auto-upload for new products in feed
3. Integrate AI-powered video generation from product descriptions
