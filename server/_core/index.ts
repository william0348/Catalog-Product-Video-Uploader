import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // COOP/COEP headers for SharedArrayBuffer (FFmpeg WASM)
  // Use "same-origin-allow-popups" instead of "same-origin" to allow Google OAuth popup
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    next();
  });

  // Register Manus OAuth routes
  registerOAuthRoutes(app);

  // CSV export endpoint for Meta Catalog Supplementary Feed
  // Format: id, video[0].url, video[1].url (per Meta specification)
  // Ref: https://www.facebook.com/business/help/412185511855836
  app.get("/api/export/csv/:catalogId", async (req, res) => {
    try {
      const { getUploadRecordsByCatalog } = await import("../db");
      const catalogId = req.params.catalogId;
      const records = await getUploadRecordsByCatalog(catalogId);

      const escapeCsvField = (str: string) => {
        if (!str) return '';
        // Wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const header = 'id,video[0].url,video[1].url';
      const rows = records.map(record => {
        const id = escapeCsvField(record.retailerId);
        const v4x5 = escapeCsvField(record.video4x5Download || '');
        const v9x16 = escapeCsvField(record.video9x16Download || '');
        return `${id},${v4x5},${v9x16}`;
      }).join('\n');

      const csvContent = header + '\n' + rows;

      // UTF-8 BOM for proper encoding detection by Meta's crawler
      const BOM = '\uFEFF';
      const csvWithBom = BOM + csvContent;

      // Headers optimized for Meta Commerce Manager feed fetching:
      // - text/csv inline (no Content-Disposition: attachment which can confuse crawlers)
      // - Cache-Control to ensure Meta always gets fresh data
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.send(csvWithBom);
    } catch (error) {
      console.error("[CSV Export] Error:", error);
      res.status(500).json({ error: "Failed to export CSV" });
    }
  });

  // Keep legacy XML endpoint as redirect to CSV
  app.get("/api/export/xml/:catalogId", (req, res) => {
    res.redirect(`/api/export/csv/${req.params.catalogId}`);
  });

  // JSON export endpoint (alternative)
  app.get("/api/export/json/:catalogId", async (req, res) => {
    try {
      const { getUploadRecordsByCatalog } = await import("../db");
      const catalogId = req.params.catalogId;
      const records = await getUploadRecordsByCatalog(catalogId);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json(records);
    } catch (error) {
      console.error("[JSON Export] Error:", error);
      res.status(500).json({ error: "Failed to export JSON" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // In development, use Vite dev server with HMR
  // In production, serve pre-built static files
  if (process.env.NODE_ENV === "development") {
    // Use computed path to prevent esbuild from bundling vite.ts (dev-only)
    const vitePath = "./vi" + "te";
    const { setupVite } = await import(vitePath);
    await setupVite(app, server);
  } else {
    // Inline serveStatic to avoid importing vite.ts (which depends on vite devDep)
    const distPath = path.resolve(import.meta.dirname, "public");
    app.use(express.static(distPath));
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
