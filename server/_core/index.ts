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
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // CSV export endpoint for Meta Catalog
  app.get("/api/export/csv/:catalogId", async (req, res) => {
    try {
      const { getUploadRecordsByCatalog, getSetting } = await import("../db");
      const catalogId = req.params.catalogId;
      const records = await getUploadRecordsByCatalog(catalogId);
      const clientName = records.length > 0 ? records[0].clientName : "";

      // CSV header
      const headers = ["id", "video[0].url", "video[1].url", "#\u5EE0\u5546\u540D\u7A31", "#Product Name"];
      const csvRows = [headers.join(",")];

      for (const record of records) {
        const row = [
          record.retailerId,
          record.video4x5Embed || "",
          record.video9x16Embed || "",
          clientName,
          `"${(record.productName || "").replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(","));
      }

      const csvContent = csvRows.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="catalog_${catalogId}.csv"`);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(csvContent);
    } catch (error) {
      console.error("[CSV Export] Error:", error);
      res.status(500).json({ error: "Failed to export CSV" });
    }
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
