import { describe, it, expect } from "vitest";

describe("Google Client ID Environment Variable", () => {
  it("should have VITE_GOOGLE_CLIENT_ID set in environment", () => {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    expect(clientId).toBeDefined();
    expect(clientId).not.toBe("");
  });

  it("should be a valid Google Client ID format", () => {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    expect(clientId).toBeDefined();
    // Google Client IDs end with .apps.googleusercontent.com
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
  });
});
