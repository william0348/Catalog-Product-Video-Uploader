import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Test the Facebook error code to Chinese message mapping logic
// This mirrors the logic in routers.ts validateToken endpoint

function mapFbErrorToChinese(code: number | undefined, subcode: number | undefined, fbMsg: string): string {
  let reason = '';
  if (code === 190) {
    if (subcode === 463) {
      reason = 'Token 已過期，請重新產生一組新的 Access Token。';
    } else if (subcode === 467) {
      reason = 'Token 已失效，可能是因為使用者已變更密碼或撤銷授權。';
    } else if (subcode === 460) {
      reason = 'Token 已失效，因為使用者已登出所有裝置。';
    } else {
      reason = `Token 無效或已過期（錯誤碼: ${code}${subcode ? '/' + subcode : ''}）。請重新產生 Token。`;
    }
  } else if (code === 4) {
    reason = 'API 呼叫次數過多，請稍後再試。';
  } else if (code === 17) {
    reason = '已達到 API 速率限制，請稍後再試。';
  } else if (code === 10) {
    reason = '權限不足，請確認 Token 擁有必要的存取權限。';
  } else if (code === 200) {
    reason = '權限不足，請確認應用程式已獲得必要的授權。';
  } else {
    reason = fbMsg ? `驗證失敗：${fbMsg}` : 'Token 無效，請檢查後重試。';
  }
  return reason;
}

describe("Token error message mapping (Chinese)", () => {
  it("maps code 190 subcode 463 to expired message", () => {
    const msg = mapFbErrorToChinese(190, 463, "Error validating access token");
    expect(msg).toContain("已過期");
    expect(msg).toContain("重新產生");
  });

  it("maps code 190 subcode 467 to password changed message", () => {
    const msg = mapFbErrorToChinese(190, 467, "");
    expect(msg).toContain("變更密碼");
    expect(msg).toContain("撤銷授權");
  });

  it("maps code 190 subcode 460 to logged out message", () => {
    const msg = mapFbErrorToChinese(190, 460, "");
    expect(msg).toContain("登出所有裝置");
  });

  it("maps code 190 with unknown subcode to generic expired message", () => {
    const msg = mapFbErrorToChinese(190, 999, "");
    expect(msg).toContain("無效或已過期");
    expect(msg).toContain("190/999");
  });

  it("maps code 190 without subcode to generic expired message", () => {
    const msg = mapFbErrorToChinese(190, undefined, "");
    expect(msg).toContain("無效或已過期");
    expect(msg).toContain("190");
    expect(msg).not.toContain("/undefined");
  });

  it("maps code 4 to rate limit message", () => {
    const msg = mapFbErrorToChinese(4, undefined, "");
    expect(msg).toContain("呼叫次數過多");
  });

  it("maps code 17 to API rate limit message", () => {
    const msg = mapFbErrorToChinese(17, undefined, "");
    expect(msg).toContain("速率限制");
  });

  it("maps code 10 to permission message", () => {
    const msg = mapFbErrorToChinese(10, undefined, "");
    expect(msg).toContain("權限不足");
  });

  it("maps code 200 to authorization message", () => {
    const msg = mapFbErrorToChinese(200, undefined, "");
    expect(msg).toContain("權限不足");
    expect(msg).toContain("授權");
  });

  it("maps unknown code with fbMsg to generic message", () => {
    const msg = mapFbErrorToChinese(999, undefined, "Some unknown error");
    expect(msg).toContain("驗證失敗");
    expect(msg).toContain("Some unknown error");
  });

  it("maps unknown code without fbMsg to fallback message", () => {
    const msg = mapFbErrorToChinese(999, undefined, "");
    expect(msg).toContain("無效");
    expect(msg).toContain("重試");
  });

  it("maps undefined code with fbMsg to generic message", () => {
    const msg = mapFbErrorToChinese(undefined, undefined, "Something went wrong");
    expect(msg).toContain("驗證失敗");
    expect(msg).toContain("Something went wrong");
  });
});

describe("refreshTokenExpiration invalid token detection", () => {
  // Test the is_valid === false detection logic from refreshTokenExpiration
  function mapRefreshError(debugData: any): { error: string; isInvalid: boolean } | null {
    if (debugData?.data?.is_valid === false) {
      const fbError = debugData?.data?.error;
      const code = fbError?.code;
      const subcode = fbError?.subcode;
      let reason = '';
      if (code === 190) {
        if (subcode === 463) {
          reason = 'Token 已過期，請重新產生一組新的 Access Token。';
        } else if (subcode === 467) {
          reason = 'Token 已失效，可能是因為使用者已變更密碼或撤銷授權。';
        } else if (subcode === 460) {
          reason = 'Token 已失效，因為使用者已登出所有裝置。';
        } else {
          reason = fbError?.message ? `Token 已失效：${fbError.message}` : 'Token 已失效，請重新產生。';
        }
      } else {
        reason = fbError?.message ? `Token 無效：${fbError.message}` : 'Token 無效，請重新產生。';
      }
      return { error: reason, isInvalid: true };
    }
    return null;
  }

  it("detects expired token (code 190, subcode 463)", () => {
    const result = mapRefreshError({
      data: { is_valid: false, error: { code: 190, subcode: 463, message: "Error validating access token: Session has expired" } }
    });
    expect(result).not.toBeNull();
    expect(result!.isInvalid).toBe(true);
    expect(result!.error).toContain("已過期");
  });

  it("detects password changed token (code 190, subcode 467)", () => {
    const result = mapRefreshError({
      data: { is_valid: false, error: { code: 190, subcode: 467, message: "Error validating access token" } }
    });
    expect(result).not.toBeNull();
    expect(result!.isInvalid).toBe(true);
    expect(result!.error).toContain("變更密碼");
  });

  it("returns null for valid token", () => {
    const result = mapRefreshError({
      data: { is_valid: true, expires_at: 1735689600 }
    });
    expect(result).toBeNull();
  });

  it("handles unknown error code in invalid token", () => {
    const result = mapRefreshError({
      data: { is_valid: false, error: { code: 999, message: "Unknown error" } }
    });
    expect(result).not.toBeNull();
    expect(result!.isInvalid).toBe(true);
    expect(result!.error).toContain("Unknown error");
  });
});
