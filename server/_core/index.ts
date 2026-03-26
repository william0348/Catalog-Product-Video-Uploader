import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";

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

  // Enable SharedArrayBuffer for FFmpeg WASM (requires COOP + COEP headers)
  // Using "credentialless" instead of "require-corp" to allow cross-origin resources
  // (Google APIs, Facebook CDN images, etc.) without requiring CORP headers on them
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    next();
  });
  // OAuth removed for Cloud Run deployment

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
  // Serve static files in production
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });

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
