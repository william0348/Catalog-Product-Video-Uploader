import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => {
  const records: any[] = [];
  const settings: Record<string, string> = {};
  let nextId = 1;

  return {
    upsertUser: vi.fn(),
    getUserByOpenId: vi.fn(),
    createUploadRecord: vi.fn(async (data: any) => {
      const record = { id: nextId++, ...data, uploadTimestamp: new Date() };
      records.push(record);
      return record;
    }),
    createUploadRecordsBatch: vi.fn(async (batch: any[]) => {
      for (const data of batch) {
        records.push({ id: nextId++, ...data, uploadTimestamp: new Date() });
      }
    }),
    getUploadRecordsByCatalog: vi.fn(async (catalogId: string) => {
      return records.filter((r) => r.catalogId === catalogId);
    }),
    getAllUploadRecords: vi.fn(async () => records),
    deleteUploadRecord: vi.fn(async (id: number) => {
      const idx = records.findIndex((r) => r.id === id);
      if (idx >= 0) records.splice(idx, 1);
    }),
    getSetting: vi.fn(async (key: string) => {
      return settings[key] ? { key, value: settings[key] } : null;
    }),
    setSetting: vi.fn(async (key: string, value: string) => {
      settings[key] = value;
    }),
    getAllSettings: vi.fn(async () => {
      return Object.entries(settings).map(([key, value]) => ({ key, value }));
    }),
  };
});

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("uploads router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a single upload record", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-456",
      productName: "Test Product",
      productImageUrl: "https://example.com/img.jpg",
      video4x5Download: "https://drive.google.com/4x5",
      video4x5Embed: "https://drive.google.com/4x5/embed",
      video9x16Download: "https://drive.google.com/9x16",
      video9x16Embed: "https://drive.google.com/9x16/embed",
      clientName: "Acme Corp",
      uploadedBy: "test-user",
    });

    expect(result).toBeDefined();
    expect(result.catalogId).toBe("cat-123");
    expect(result.retailerId).toBe("ret-456");
    expect(result.productName).toBe("Test Product");
    expect(result.clientName).toBe("Acme Corp");
  });

  it("creates batch upload records", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.createBatch([
      {
        catalogId: "cat-123",
        retailerId: "ret-001",
        productName: "Product A",
        clientName: "Acme Corp",
      },
      {
        catalogId: "cat-123",
        retailerId: "ret-002",
        productName: "Product B",
        clientName: "Acme Corp",
      },
    ]);

    expect(result).toEqual({ success: true });
  });

  it("lists upload records by catalog", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const records = await caller.uploads.listByCatalog({ catalogId: "cat-123" });

    expect(Array.isArray(records)).toBe(true);
  });

  it("lists all upload records", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const records = await caller.uploads.listAll();

    expect(Array.isArray(records)).toBe(true);
  });

  it("deletes an upload record", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.delete({ id: 1 });

    expect(result).toEqual({ success: true });
  });
});

describe("settings router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets a setting value", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.set({
      key: "fb_access_token",
      value: "test-token-123",
    });

    expect(result).toEqual({ success: true });
  });

  it("gets a setting value", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.get({ key: "fb_access_token" });

    // The mock returns the value that was set
    expect(result).toBeDefined();
  });

  it("gets all settings", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.getAll();

    expect(Array.isArray(result)).toBe(true);
  });
});
