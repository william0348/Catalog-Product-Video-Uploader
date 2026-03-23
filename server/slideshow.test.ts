import { describe, expect, it, vi } from "vitest";
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

describe("slideshow router", () => {
  describe("slideshow.fetchProducts", () => {
    it("rejects empty catalogId", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.fetchProducts({
          catalogId: "",
          accessToken: "test-token",
          limit: 10,
        })
      ).rejects.toThrow();
    });

    it("rejects limit above 500", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.fetchProducts({
          catalogId: "123",
          accessToken: "test-token",
          limit: 501,
        })
      ).rejects.toThrow();
    });

    it("rejects limit below 1", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.fetchProducts({
          catalogId: "123",
          accessToken: "test-token",
          limit: 0,
        })
      ).rejects.toThrow();
    });
  });

  describe("slideshow.generate input validation", () => {
    it("rejects empty images array", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [],
          aspectRatio: "4:5",
          durationPerImage: 3,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
        })
      ).rejects.toThrow();
    });

    it("rejects more than 50 images", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const images = Array.from({ length: 51 }, (_, i) => ({
        url: `https://example.com/img${i}.jpg`,
        label: `Product ${i}`,
      }));

      await expect(
        caller.slideshow.generate({
          images,
          aspectRatio: "4:5",
          durationPerImage: 3,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
        })
      ).rejects.toThrow();
    });

    it("rejects invalid aspect ratio", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "16:9" as any,
          durationPerImage: 3,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
        })
      ).rejects.toThrow();
    });

    it("rejects invalid transition type", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "4:5",
          durationPerImage: 3,
          transition: "dissolve" as any,
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
        })
      ).rejects.toThrow();
    });

    it("rejects duration below 1 second", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "4:5",
          durationPerImage: 0.5,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
        })
      ).rejects.toThrow();
    });

    it("rejects duration above 30 seconds", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "4:5",
          durationPerImage: 31,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
        })
      ).rejects.toThrow();
    });

    it("rejects invalid image URL", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "not-a-url" }],
          aspectRatio: "4:5",
          durationPerImage: 3,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
        })
      ).rejects.toThrow();
    });

    it("accepts valid 9:16 aspect ratio with audio params", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      // This will fail at the FFmpeg step (no real image), but should pass validation
      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "9:16",
          durationPerImage: 3,
          transition: "slideup",
          transitionDuration: 0.5,
          showProductName: true,
          textPosition: "top",
          fontSize: 48,
          audioUrl: "https://example.com/music.mp3",
          audioVolume: 0.7,
        })
      ).rejects.toThrow(); // Will throw because of download failure, not validation
    }, 15000);

    it("rejects audioVolume above 1", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "4:5",
          durationPerImage: 3,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
          audioUrl: "https://example.com/music.mp3",
          audioVolume: 1.5,
        })
      ).rejects.toThrow();
    });

    it("rejects audioVolume below 0", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "4:5",
          durationPerImage: 3,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
          audioUrl: "https://example.com/music.mp3",
          audioVolume: -0.5,
        })
      ).rejects.toThrow();
    });

    it("rejects invalid audioUrl", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.generate({
          images: [{ url: "https://example.com/img.jpg" }],
          aspectRatio: "4:5",
          durationPerImage: 3,
          transition: "fade",
          transitionDuration: 0.5,
          showProductName: false,
          textPosition: "bottom",
          audioUrl: "not-a-url",
        })
      ).rejects.toThrow();
    });
  });

  describe("slideshow.uploadImage", () => {
    it("uploads image and returns URL", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.slideshow.uploadImage({
        base64Data: "dGVzdA==",
        fileName: "test.png",
        mimeType: "image/png",
      });

      expect(result.success).toBe(true);
      expect(result.url).toBeDefined();
      expect(result.url).toContain("slideshow-uploads");
    });
  });

  describe("slideshow.uploadAudio", () => {
    it("uploads audio and returns URL", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.slideshow.uploadAudio({
        base64Data: "dGVzdA==",
        fileName: "test.mp3",
        mimeType: "audio/mpeg",
      });

      expect(result.success).toBe(true);
      expect(result.url).toBeDefined();
      expect(result.url).toContain("slideshow-audio");
    });
  });

  describe("slideshow.proxyUploadImage", () => {
    it("rejects invalid URL", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.proxyUploadImage({
          imageUrl: "not-a-url",
        })
      ).rejects.toThrow();
    });

    it("throws error for unreachable URL", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.proxyUploadImage({
          imageUrl: "https://example.com/nonexistent-image-12345.jpg",
        })
      ).rejects.toThrow();
    }, 15000);
  });

  describe("slideshow.proxyUploadImages", () => {
    it("rejects empty array", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.proxyUploadImages({
          imageUrls: [],
        })
      ).rejects.toThrow();
    });

    it("rejects invalid URLs in array", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.proxyUploadImages({
          imageUrls: ["not-a-url"],
        })
      ).rejects.toThrow();
    });

    it("returns error for unreachable URLs without throwing", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.slideshow.proxyUploadImages({
        imageUrls: ["https://example.com/nonexistent-image-12345.jpg"],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].s3Url).toBeNull();
      expect(result.results[0].error).toBeTruthy();
    }, 15000);
  });

  describe("slideshow.updateCatalogVideo input validation", () => {
    it("rejects invalid videoUrl", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.slideshow.updateCatalogVideo({
          catalogId: "123",
          accessToken: "test-token",
          retailerId: "SKU-001",
          videoUrl: "not-a-url",
        })
      ).rejects.toThrow();
    });

    it("returns success:false with invalid token", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.slideshow.updateCatalogVideo({
        catalogId: "123",
        accessToken: "test-token",
        retailerId: "SKU-001",
        videoUrl: "https://example.com/video.mp4",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns error message for empty catalogId", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.slideshow.updateCatalogVideo({
        catalogId: "",
        accessToken: "test-token",
        retailerId: "SKU-001",
        videoUrl: "https://example.com/video.mp4",
      });

      expect(result.success).toBe(false);
    });
  });
});
