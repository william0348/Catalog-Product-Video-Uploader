import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module to avoid actual database calls
vi.mock("./db", () => ({
  createUploadRecord: vi.fn().mockResolvedValue({ id: 1 }),
  createUploadRecordsBatch: vi.fn().mockResolvedValue(undefined),
  getUploadRecordsByCatalog: vi.fn().mockResolvedValue([]),
  getUploadRecordsByCompany: vi.fn().mockResolvedValue([]),
  getAllUploadRecords: vi.fn().mockResolvedValue([]),
  deleteUploadRecord: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  getAllSettings: vi.fn().mockResolvedValue([]),
  getUploadRecordById: vi.fn().mockResolvedValue(null),
  getUploadersByCompany: vi.fn().mockResolvedValue([]),
  getAllUploaders: vi.fn().mockResolvedValue([]),
  createCompany: vi.fn().mockResolvedValue({ id: 1 }),
  getCompanyById: vi.fn().mockResolvedValue(null),
  updateCompany: vi.fn().mockResolvedValue(undefined),
  getCompaniesByEmail: vi.fn().mockResolvedValue([]),
  addCompanyMember: vi.fn().mockResolvedValue({ id: 1 }),
  getCompanyMembers: vi.fn().mockResolvedValue([]),
  removeCompanyMember: vi.fn().mockResolvedValue(undefined),
  activateMemberByEmail: vi.fn().mockResolvedValue(undefined),
  createSlideshowTemplate: vi.fn().mockResolvedValue({ id: 1 }),
  getSlideshowTemplates: vi.fn().mockResolvedValue([]),
  getSlideshowTemplateById: vi.fn().mockResolvedValue(null),
  updateSlideshowTemplate: vi.fn().mockResolvedValue(undefined),
  deleteSlideshowTemplate: vi.fn().mockResolvedValue(undefined),
}));

// Mock slideshow module
vi.mock("./slideshow", () => ({
  generateSlideshow: vi.fn(),
  fetchCatalogProducts: vi.fn(),
  updateCatalogProductVideo: vi.fn(),
  fetchProductSets: vi.fn(),
  fetchProductSetProducts: vi.fn(),
  fetchAllProductSetProducts: vi.fn(),
}));

function createTestContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("uploads.createBatch", () => {
  it("accepts records with all fields including productImageUrl, video4x5/9x16 download/embed, clientName, uploadedBy", async () => {
    const { createUploadRecordsBatch } = await import("./db");
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const batchInput = [
      {
        catalogId: "123456789",
        retailerId: "SKU-001",
        productName: "Test Product",
        productImageUrl: "https://example.com/image.jpg",
        video4x5Download: "https://example.com/4x5.mp4",
        video4x5Embed: "https://example.com/4x5-embed.mp4",
        video9x16Download: "https://example.com/9x16.mp4",
        video9x16Embed: "https://example.com/9x16-embed.mp4",
        clientName: "Test Client",
        uploadedBy: "test@example.com",
      },
      {
        catalogId: "123456789",
        retailerId: "SKU-002",
        productName: "Test Product 2",
        clientName: "Excel Import",
        uploadedBy: "excel_import",
      },
    ];

    const result = await caller.uploads.createBatch(batchInput);

    expect(result).toEqual({ success: true });
    expect(createUploadRecordsBatch).toHaveBeenCalledTimes(1);

    const calledWith = (createUploadRecordsBatch as any).mock.calls[0][0];
    expect(calledWith).toHaveLength(2);

    // First record should have all fields mapped
    expect(calledWith[0]).toMatchObject({
      catalogId: "123456789",
      retailerId: "SKU-001",
      productName: "Test Product",
      productImageUrl: "https://example.com/image.jpg",
      video4x5Download: "https://example.com/4x5.mp4",
      video4x5Embed: "https://example.com/4x5-embed.mp4",
      video9x16Download: "https://example.com/9x16.mp4",
      video9x16Embed: "https://example.com/9x16-embed.mp4",
      clientName: "Test Client",
      uploadedBy: "test@example.com",
    });

    // Second record should have null for optional fields
    expect(calledWith[1]).toMatchObject({
      catalogId: "123456789",
      retailerId: "SKU-002",
      productName: "Test Product 2",
      productImageUrl: null,
      video4x5Download: null,
      video4x5Embed: null,
      video9x16Download: null,
      video9x16Embed: null,
      clientName: "Excel Import",
      uploadedBy: "excel_import",
    });
  });

  it("accepts records with only required fields (catalogId, retailerId, productName, clientName)", async () => {
    const { createUploadRecordsBatch } = await import("./db");
    vi.mocked(createUploadRecordsBatch).mockClear();
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.createBatch([
      {
        catalogId: "999",
        retailerId: "SKU-MINIMAL",
        productName: "Minimal Product",
        clientName: "Test Client",
      },
    ]);

    expect(result).toEqual({ success: true });
    const calledWith = vi.mocked(createUploadRecordsBatch).mock.calls[0][0];
    expect(calledWith[0]).toMatchObject({
      catalogId: "999",
      retailerId: "SKU-MINIMAL",
      productName: "Minimal Product",
      productImageUrl: null,
      video4x5Download: null,
      video4x5Embed: null,
      video9x16Download: null,
      video9x16Embed: null,
      clientName: "Test Client",
      uploadedBy: null,
    });
  });
});
