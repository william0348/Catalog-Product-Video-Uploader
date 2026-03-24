import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // XML export endpoint for Meta Catalog (RSS/Google Merchant format)
  app.get("/api/export/xml/:catalogId", async (req, res) => {
    try {
      const { getUploadRecordsByCatalog } = await import("../db");
      const catalogId = req.params.catalogId;
      const records = await getUploadRecordsByCatalog(catalogId);

      const escapeXml = (str: string) =>
        str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

      const items = records.map(record => {
        return `    <item>
      <g:id>${escapeXml(record.retailerId)}</g:id>
      <video>
      <url>${escapeXml(record.video4x5Download || "")}</url></video>
      <video>
      <url>${escapeXml(record.video9x16Download || "")}</url></video>
    </item>`;
      }).join("\n");

      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>catalog_${escapeXml(catalogId)}_feed</title>
    <link>https://catalog-video-uploder.manus.space</link>
    <description>Meta Catalog Video Feed</description>
${items}
  </channel>
</rss>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="catalog_${catalogId}.xml"`);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(xmlContent);
    } catch (error) {
      console.error("[XML Export] Error:", error);
      res.status(500).json({ error: "Failed to export XML" });
    }
  });

  // Keep legacy CSV endpoint as redirect to XML
  app.get("/api/export/csv/:catalogId", (req, res) => {
    res.redirect(`/api/export/xml/${req.params.catalogId}`);
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
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
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
