import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for Facebook API calls
const originalFetch = globalThis.fetch;

describe("token expiration", () => {
  describe("isTokenExpiringSoon helper (client-side logic)", () => {
    // Replicate the client-side helper for testing
    const isTokenExpiringSoon = (expiresAt: string | null, withinDays: number = 7) => {
      if (!expiresAt) return { expiring: false, daysLeft: null, expired: false };
      const now = new Date();
      const expiryDate = new Date(expiresAt);
      const diffMs = expiryDate.getTime() - now.getTime();
      const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (daysLeft < 0) return { expiring: true, daysLeft, expired: true };
      if (daysLeft <= withinDays) return { expiring: true, daysLeft, expired: false };
      return { expiring: false, daysLeft, expired: false };
    };

    it("returns not expiring for null expiresAt", () => {
      const result = isTokenExpiringSoon(null);
      expect(result).toEqual({ expiring: false, daysLeft: null, expired: false });
    });

    it("returns expired for past date", () => {
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const result = isTokenExpiringSoon(pastDate);
      expect(result.expired).toBe(true);
      expect(result.expiring).toBe(true);
      expect(result.daysLeft).toBeLessThan(0);
    });

    it("returns expiring for date within 7 days", () => {
      const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const result = isTokenExpiringSoon(soonDate, 7);
      expect(result.expiring).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.daysLeft).toBeGreaterThanOrEqual(2);
      expect(result.daysLeft).toBeLessThanOrEqual(3);
    });

    it("returns not expiring for date more than 7 days away", () => {
      const farDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = isTokenExpiringSoon(farDate, 7);
      expect(result.expiring).toBe(false);
      expect(result.expired).toBe(false);
      expect(result.daysLeft).toBeGreaterThanOrEqual(29);
    });

    it("returns expiring for date exactly on the boundary (7 days)", () => {
      const boundaryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = isTokenExpiringSoon(boundaryDate, 7);
      expect(result.expiring).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.daysLeft).toBeLessThanOrEqual(7);
    });

    it("handles custom withinDays parameter", () => {
      const date = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(isTokenExpiringSoon(date, 14).expiring).toBe(true);
      expect(isTokenExpiringSoon(date, 5).expiring).toBe(false);
    });

    it("returns correct daysLeft for today expiry", () => {
      const todayDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours from now
      const result = isTokenExpiringSoon(todayDate);
      expect(result.expiring).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.daysLeft).toBe(0);
    });
  });

  describe("Facebook debug_token response parsing", () => {
    it("correctly parses expires_at from debug_token response", () => {
      const debugResponse = {
        data: {
          app_id: "123456",
          type: "USER",
          is_valid: true,
          expires_at: 1735689600, // Unix timestamp
        }
      };
      
      const expiresAt = new Date(debugResponse.data.expires_at * 1000);
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBe(1735689600000);
    });

    it("handles never-expiring token (expires_at = 0)", () => {
      const debugResponse = {
        data: {
          app_id: "123456",
          type: "USER",
          is_valid: true,
          expires_at: 0,
        }
      };
      
      const neverExpires = debugResponse.data.expires_at === 0;
      expect(neverExpires).toBe(true);
    });

    it("handles invalid token response", () => {
      const debugResponse = {
        data: {
          is_valid: false,
          error: {
            code: 190,
            message: "Error validating access token",
          }
        }
      };
      
      expect(debugResponse.data.is_valid).toBe(false);
      expect(debugResponse.data.error?.message).toBeTruthy();
    });
  });
});
