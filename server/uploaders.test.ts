import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("uploads.allUploaders", () => {
  it("returns an array", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.allUploaders();

    expect(Array.isArray(result)).toBe(true);
    // Each item should have the expected shape
    for (const item of result) {
      expect(item).toHaveProperty("uploadedBy");
      expect(item).toHaveProperty("totalUploads");
      expect(item).toHaveProperty("lastUploadDate");
      expect(item).toHaveProperty("catalogs");
      expect(typeof item.uploadedBy).toBe("string");
      expect(typeof item.totalUploads).toBe("number");
      expect(Array.isArray(item.catalogs)).toBe(true);
    }
  });
});

describe("uploads.uploadersByCompany", () => {
  it("returns an array for a given companyId", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.uploads.uploadersByCompany({ companyId: 1 });

    expect(Array.isArray(result)).toBe(true);
    for (const item of result) {
      expect(item).toHaveProperty("uploadedBy");
      expect(item).toHaveProperty("totalUploads");
      expect(item).toHaveProperty("lastUploadDate");
      expect(item).toHaveProperty("catalogs");
    }
  });

  it("validates companyId is a number", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Should throw for invalid input
    await expect(
      // @ts-expect-error - testing invalid input
      caller.uploads.uploadersByCompany({ companyId: "not-a-number" })
    ).rejects.toThrow();
  });
});
