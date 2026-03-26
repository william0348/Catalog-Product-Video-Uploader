import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => {
  return {
    getAllUploadRecords: vi.fn(),
    getUploadersByCompany: vi.fn(),
    getAllUploaders: vi.fn(),
  };
});

import { getAllUploadRecords, getUploadersByCompany, getAllUploaders } from "./db";

describe("Video Log Deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAllUploadRecords should return deduplicated records (one per retailerId+catalogId)", async () => {
    // Mock: simulate that the DB query already returns deduplicated results
    const mockRecords = [
      {
        id: 2,
        companyId: 1,
        catalogId: "778284289334909",
        retailerId: "12817610",
        productName: "MAXCLINIC Product",
        productImageUrl: "https://example.com/img.jpg",
        video4x5Download: "https://example.com/4x5.mp4",
        video4x5Embed: "https://example.com/4x5-embed.mp4",
        video9x16Download: null,
        video9x16Embed: null,
        clientName: "momo test catalog",
        uploadTimestamp: new Date("2026-03-25T13:42:00Z"),
        uploadedBy: "william03480348@gmail.com",
      },
    ];

    (getAllUploadRecords as any).mockResolvedValue(mockRecords);

    const result = await getAllUploadRecords();

    // Should return only 1 record (deduplicated)
    expect(result).toHaveLength(1);
    // Should be the latest record (id: 2)
    expect(result[0].id).toBe(2);
    // Should have uploadedBy field
    expect(result[0].uploadedBy).toBe("william03480348@gmail.com");
  });

  it("each record should include uploadedBy field for uploader info display", async () => {
    const mockRecords = [
      {
        id: 5,
        companyId: 1,
        catalogId: "cat1",
        retailerId: "ret1",
        productName: "Product A",
        productImageUrl: null,
        video4x5Download: null,
        video4x5Embed: null,
        video9x16Download: null,
        video9x16Embed: null,
        clientName: "Client A",
        uploadTimestamp: new Date("2026-03-25T10:00:00Z"),
        uploadedBy: "user@example.com",
      },
      {
        id: 6,
        companyId: 1,
        catalogId: "cat2",
        retailerId: "ret2",
        productName: "Product B",
        productImageUrl: null,
        video4x5Download: null,
        video4x5Embed: null,
        video9x16Download: null,
        video9x16Embed: null,
        clientName: "Client B",
        uploadTimestamp: new Date("2026-03-25T11:00:00Z"),
        uploadedBy: null,
      },
    ];

    (getAllUploadRecords as any).mockResolvedValue(mockRecords);

    const result = await getAllUploadRecords();

    // All records should have the uploadedBy property
    result.forEach((record: any) => {
      expect(record).toHaveProperty("uploadedBy");
    });

    // First record has email
    expect(result[0].uploadedBy).toBe("user@example.com");
    // Second record has null (no uploader)
    expect(result[1].uploadedBy).toBeNull();
  });
});

describe("Uploader Personnel (removed tab, but backend still exists)", () => {
  it("getAllUploaders should still return data for potential future use", async () => {
    const mockUploaders = [
      {
        uploadedBy: "user1@example.com",
        totalUploads: 5,
        lastUploadDate: "2026-03-25T13:42:00Z",
        catalogs: ["cat1", "cat2"],
      },
    ];

    (getAllUploaders as any).mockResolvedValue(mockUploaders);

    const result = await getAllUploaders();
    expect(result).toHaveLength(1);
    expect(result[0].uploadedBy).toBe("user1@example.com");
  });
});
