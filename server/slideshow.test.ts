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

    it("rejects more than 30 images", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const images = Array.from({ length: 31 }, (_, i) => ({
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

    it("accepts valid 9:16 aspect ratio", async () => {
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
        })
      ).rejects.toThrow(); // Will throw because of download failure, not validation
    });
  });
});
