import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// In-memory stores for mocking
let records: any[] = [];
let settings: Record<string, string> = {};
let companiesStore: any[] = [];
let membersStore: any[] = [];
let nextId = 1;
let nextCompanyId = 1;
let nextMemberId = 1;

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
    getUploadRecordsByCompany: vi.fn(async (companyId: number) => {
      return records.filter((r) => r.companyId === companyId);
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
    // Company functions
    createCompany: vi.fn(async (data: any) => {
      const company = { id: nextCompanyId++, ...data, createdAt: new Date(), updatedAt: new Date() };
      companiesStore.push(company);
      return company;
    }),
    getCompanyById: vi.fn(async (id: number) => {
      return companiesStore.find((c) => c.id === id) || undefined;
    }),
    updateCompany: vi.fn(async (id: number, data: any) => {
      const idx = companiesStore.findIndex((c) => c.id === id);
      if (idx >= 0) {
        companiesStore[idx] = { ...companiesStore[idx], ...data };
      }
    }),
    getCompaniesByEmail: vi.fn(async (email: string) => {
      const memberCompanyIds = membersStore
        .filter((m) => m.email === email.toLowerCase())
        .map((m) => m.companyId);
      return companiesStore
        .filter((c) => memberCompanyIds.includes(c.id))
        .map((c) => {
          const member = membersStore.find((m) => m.email === email.toLowerCase() && m.companyId === c.id);
          return { ...c, memberRole: member?.memberRole || "member", status: member?.status || "active" };
        });
    }),
    addCompanyMember: vi.fn(async (data: any) => {
      // Check if already exists
      const existing = membersStore.find(
        (m) => m.companyId === data.companyId && m.email === data.email.toLowerCase()
      );
      if (existing) return existing;
      const member = { id: nextMemberId++, ...data, email: data.email.toLowerCase(), createdAt: new Date() };
      membersStore.push(member);
      return member;
    }),
    getCompanyMembers: vi.fn(async (companyId: number) => {
      return membersStore.filter((m) => m.companyId === companyId);
    }),
    removeCompanyMember: vi.fn(async (companyId: number, email: string) => {
      const idx = membersStore.findIndex(
        (m) => m.companyId === companyId && m.email === email.toLowerCase()
      );
      if (idx >= 0) membersStore.splice(idx, 1);
    }),
    activateMemberByEmail: vi.fn(async (email: string, userId: number) => {
      membersStore.forEach((m) => {
        if (m.email === email.toLowerCase() && m.status === "pending") {
          m.status = "active";
          m.userId = userId;
        }
      });
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

describe("company management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    records = [];
    settings = {};
    companiesStore = [];
    membersStore = [];
    nextId = 1;
    nextCompanyId = 1;
    nextMemberId = 1;
  });

  it("creates a company and adds creator as owner", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const company = await caller.company.create({
      name: "RhinoShield",
      email: "admin@rhinoshield.com",
      facebookAccessToken: "test-token-abc",
      accessKey: "secret123",
    });

    expect(company).toBeDefined();
    expect(company!.name).toBe("RhinoShield");
    expect(companiesStore.length).toBe(1);
    expect(membersStore.length).toBe(1);
    expect(membersStore[0].email).toBe("admin@rhinoshield.com");
    expect(membersStore[0].memberRole).toBe("owner");
    expect(membersStore[0].status).toBe("active");
  });

  it("gets company by ID", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a company first
    await caller.company.create({
      name: "TestCo",
      email: "owner@testco.com",
    });

    const company = await caller.company.get({ id: 1 });
    expect(company).toBeDefined();
    expect(company.name).toBe("TestCo");
  });

  it("gets companies by email", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create two companies
    await caller.company.create({
      name: "Company A",
      email: "user@example.com",
    });
    await caller.company.create({
      name: "Company B",
      email: "user@example.com",
    });

    const companies = await caller.company.getByEmail({ email: "user@example.com" });
    expect(companies.length).toBe(2);
    expect(companies[0].name).toBe("Company A");
    expect(companies[1].name).toBe("Company B");
  });

  it("updates company settings", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.company.create({
      name: "UpdateCo",
      email: "admin@updateco.com",
    });

    const result = await caller.company.update({
      id: 1,
      facebookAccessToken: "new-token-xyz",
      accessKey: "newkey",
    });

    expect(result).toEqual({ success: true });
    expect(companiesStore[0].facebookAccessToken).toBe("new-token-xyz");
    expect(companiesStore[0].accessKey).toBe("newkey");
  });
});

describe("company members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    records = [];
    settings = {};
    companiesStore = [];
    membersStore = [];
    nextId = 1;
    nextCompanyId = 1;
    nextMemberId = 1;
  });

  it("invites a member by email", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a company first
    await caller.company.create({
      name: "InviteCo",
      email: "owner@inviteco.com",
    });

    const member = await caller.members.invite({
      companyId: 1,
      email: "newuser@example.com",
    });

    expect(member).toBeDefined();
    expect(member!.email).toBe("newuser@example.com");
    expect(member!.memberRole).toBe("member");
    expect(member!.status).toBe("pending");
  });

  it("lists members of a company", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.company.create({
      name: "ListCo",
      email: "owner@listco.com",
    });

    await caller.members.invite({
      companyId: 1,
      email: "member1@listco.com",
    });

    const members = await caller.members.list({ companyId: 1 });
    expect(members.length).toBe(2); // owner + invited member
  });

  it("removes a member from company", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.company.create({
      name: "RemoveCo",
      email: "owner@removeco.com",
    });

    await caller.members.invite({
      companyId: 1,
      email: "toremove@example.com",
    });

    expect(membersStore.length).toBe(2);

    const result = await caller.members.remove({
      companyId: 1,
      email: "toremove@example.com",
    });

    expect(result).toEqual({ success: true });
    expect(membersStore.length).toBe(1);
    expect(membersStore[0].email).toBe("owner@removeco.com");
  });

  it("activates pending memberships", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.company.create({
      name: "ActivateCo",
      email: "owner@activateco.com",
    });

    await caller.members.invite({
      companyId: 1,
      email: "pending@example.com",
    });

    // Verify member is pending
    const pendingMember = membersStore.find((m) => m.email === "pending@example.com");
    expect(pendingMember!.status).toBe("pending");

    // Activate
    await caller.members.activate({
      email: "pending@example.com",
      userId: 42,
    });

    const activatedMember = membersStore.find((m) => m.email === "pending@example.com");
    expect(activatedMember!.status).toBe("active");
    expect(activatedMember!.userId).toBe(42);
  });
});

describe("uploads router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    records = [];
    settings = {};
    companiesStore = [];
    membersStore = [];
    nextId = 1;
    nextCompanyId = 1;
    nextMemberId = 1;
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

  it("creates upload record with companyId", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.create({
      companyId: 1,
      catalogId: "cat-123",
      retailerId: "ret-456",
      productName: "Test Product",
      clientName: "Acme Corp",
    });

    expect(result).toBeDefined();
    expect(result!.companyId).toBe(1);
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
    companiesStore = [];
    membersStore = [];
    nextId = 1;
    nextCompanyId = 1;
    nextMemberId = 1;
    mockFetch.mockReset();
  });

  it("throws error when record not found", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.uploads.deleteVideoFromCatalog({ id: 999 })
    ).rejects.toThrow("Record not found");
  });

  it("deletes DB record even when access token is not configured", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    const result = await caller.uploads.deleteVideoFromCatalog({ id: 1 });
    expect(result.success).toBe(true);
    expect(result.fbSuccess).toBe(false);
    expect(result.warning).toContain("No Facebook Access Token configured");
    expect(records.length).toBe(0);
  });

  it("uses company access token when companyId is provided", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a company with access token
    companiesStore.push({
      id: 1,
      name: "TestCo",
      facebookAccessToken: "company-token-abc",
      catalogs: "[]",
      accessKey: null,
      createdBy: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ handles: ["handle-123"] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "123", retailer_id: "ret-001", video: [] }] }),
      });

    const result = await caller.uploads.deleteVideoFromCatalog({ id: 1, companyId: 1 });

    expect(result.success).toBe(true);
    // Verify company token was used
    const firstCall = mockFetch.mock.calls[0];
    const body = JSON.parse(firstCall[1].body);
    expect(body.access_token).toBe("company-token-abc");
  });

  it("calls Facebook Batch API and deletes record on success", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a company with access token (no more global settings fallback)
    companiesStore.push({
      id: 10,
      name: "TestCo",
      facebookAccessToken: "test-fb-token-123",
      catalogs: "[]",
      accessKey: null,
      createdBy: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ handles: ["handle-abc-123"] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "123", retailer_id: "ret-001", video: [] }] }),
      });

    const result = await caller.uploads.deleteVideoFromCatalog({ id: 1, companyId: 10 });

    expect(result.success).toBe(true);
    expect(result.handle).toBe("handle-abc-123");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[0]).toContain("graph.facebook.com");
    expect(firstCall[0]).toContain("cat-123");

    const body = JSON.parse(firstCall[1].body);
    expect(body.access_token).toBe("test-fb-token-123");
    expect(body.requests[0].method).toBe("UPDATE");
    expect(body.requests[0].data.id).toBe("ret-001");
    expect(body.requests[0].data.video).toEqual([]);

    expect(records.length).toBe(0);
  });

  it("deletes DB record even when Facebook API returns error", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a company with access token (no more global settings fallback)
    companiesStore.push({
      id: 11,
      name: "TestCo2",
      facebookAccessToken: "test-fb-token-123",
      catalogs: "[]",
      accessKey: null,
      createdBy: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: "Invalid access token", type: "OAuthException" },
      }),
    });

    const result = await caller.uploads.deleteVideoFromCatalog({ id: 1, companyId: 11 });
    expect(result.success).toBe(true);
    expect(result.fbSuccess).toBe(false);
    expect(result.warning).toContain("Invalid access token");
    expect(records.length).toBe(0);
  });

  it("still deletes DB record even if verification fails", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await caller.uploads.create({
      catalogId: "cat-123",
      retailerId: "ret-001",
      productName: "Product A",
      clientName: "Acme Corp",
    });

    settings["facebookAccessToken"] = "test-fb-token-123";

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ handles: ["handle-xyz"] }),
      })
      .mockRejectedValueOnce(new Error("Network error during verification"));

    const result = await caller.uploads.deleteVideoFromCatalog({ id: 1 });

    expect(result.success).toBe(true);
    expect(records.length).toBe(0);
  });
});

describe("facebook proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("validates a valid access token", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: "Test User", id: "12345" }),
    });

    const result = await caller.facebook.validateToken({ accessToken: "valid-token" });
    expect(result.valid).toBe(true);
    expect(result.message).toContain("Test User");
  });

  it("returns invalid for bad token", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Invalid OAuth access token" } }),
    });

    const result = await caller.facebook.validateToken({ accessToken: "bad-token" });
    expect(result.valid).toBe(false);
    expect(result.message).toContain("Invalid OAuth access token");
  });

  it("fetches catalog name", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: "My Product Feed" }),
    });

    const result = await caller.facebook.fetchCatalogName({
      catalogId: "12345",
      accessToken: "valid-token",
    });
    expect(result.name).toBe("My Product Feed");
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
