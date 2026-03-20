import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// In-memory store for mocking
let records: any[] = [];
let settings: Record<string, string> = {};
let nextId = 1;

// Mock the database functions
vi.mock("./db", () => {
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
    getUploadRecordById: vi.fn(async (id: number) => {
      return records.find((r) => r.id === id) || undefined;
    }),
    deleteUploadRecord: vi.fn(async (id: number) => {
      const idx = records.findIndex((r) => r.id === id);
      if (idx >= 0) records.splice(idx, 1);
    }),
    getSetting: vi.fn(async (key: string) => {
      return settings[key] ?? null;
    }),
    setSetting: vi.fn(async (key: string, value: string) => {
      settings[key] = value;
    }),
    getAllSettings: vi.fn(async () => {
      return settings;
    }),
  };
});

// Mock global fetch for Facebook API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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
    records = [];
    settings = {};
    nextId = 1;
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
    expect(result!.catalogId).toBe("cat-123");
    expect(result!.retailerId).toBe("ret-456");
    expect(result!.productName).toBe("Test Product");
    expect(result!.clientName).toBe("Acme Corp");
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

    // Create a record first
    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    const result = await caller.uploads.listByCatalog({ catalogId: "cat-123" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("lists all upload records", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.listAll();
    expect(Array.isArray(result)).toBe(true);
  });

  it("deletes an upload record (simple delete)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a record first
    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    const result = await caller.uploads.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("deleteVideoFromCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    records = [];
    settings = {};
    nextId = 1;
    mockFetch.mockReset();
  });

  it("throws error when record not found", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.uploads.deleteVideoFromCatalog({ id: 999 })
    ).rejects.toThrow("Record not found");
  });

  it("throws error when access token is not configured", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a record but don't set access token
    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    await expect(
      caller.uploads.deleteVideoFromCatalog({ id: 1 })
    ).rejects.toThrow("Facebook Access Token not configured");
  });

  it("calls Facebook Batch API and deletes record on success", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a record
    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    // Set access token
    settings["facebookAccessToken"] = "test-fb-token-123";

    // Mock Facebook Batch API response (success)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ handles: ["handle-abc-123"] }),
      })
      // Mock verification call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "123", retailer_id: "ret-001", video: [] }] }),
      });

    const result = await caller.uploads.deleteVideoFromCatalog({ id: 1 });

    expect(result.success).toBe(true);
    expect(result.handle).toBe("handle-abc-123");

    // Verify Facebook API was called with correct parameters
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[0]).toContain("graph.facebook.com");
    expect(firstCall[0]).toContain("cat-123");
    expect(firstCall[0]).toContain("items_batch");

    const body = JSON.parse(firstCall[1].body);
    expect(body.access_token).toBe("test-fb-token-123");
    expect(body.requests[0].method).toBe("UPDATE");
    expect(body.requests[0].data.id).toBe("ret-001");
    expect(body.requests[0].data.video).toEqual([]);

    // Verify record was deleted from DB
    expect(records.length).toBe(0);
  });

  it("throws error when Facebook API returns error", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a record
    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    // Set access token
    settings["facebookAccessToken"] = "test-fb-token-123";

    // Mock Facebook API error response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: "Invalid access token", type: "OAuthException" },
      }),
    });

    await expect(
      caller.uploads.deleteVideoFromCatalog({ id: 1 })
    ).rejects.toThrow("Facebook API error: Invalid access token");

    // Record should NOT be deleted from DB since API failed
    expect(records.length).toBe(1);
  });

  it("still deletes DB record even if verification fails", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a record
    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    // Set access token
    settings["facebookAccessToken"] = "test-fb-token-123";

    // Mock Facebook Batch API success, but verification throws
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ handles: ["handle-xyz"] }),
      })
      .mockRejectedValueOnce(new Error("Network error during verification"));

    const result = await caller.uploads.deleteVideoFromCatalog({ id: 1 });

    expect(result.success).toBe(true);
    // Record should still be deleted even though verification failed
    expect(records.length).toBe(0);
  });
});

describe("settings router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    records = [];
    settings = {};
    nextId = 1;
  });

  it("sets a setting value", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.set({
      key: "facebookAccessToken",
      value: "test-token-123",
    });

    expect(result).toEqual({ success: true });
  });

  it("gets a setting value", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Set a value first
    settings["facebookAccessToken"] = "test-token-123";

    const result = await caller.settings.get({ key: "facebookAccessToken" });
    expect(result).toBe("test-token-123");
  });

  it("gets all settings", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    settings["facebookAccessToken"] = "token-abc";
    settings["catalogs"] = "[]";

    const result = await caller.settings.getAll();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("returns null for non-existent setting", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.get({ key: "nonExistentKey" });
    expect(result).toBeNull();
  });
});
