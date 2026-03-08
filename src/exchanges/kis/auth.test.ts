import { describe, it, expect, vi } from "vitest";
import { KisAuth } from "./auth.js";

describe("KIS auth", () => {
  it("returns production base URL by default", () => {
    const auth = new KisAuth({ appKey: "key", appSecret: "secret", accountNo: "12345678-01" });
    expect(auth.baseUrl).toContain("openapi.koreainvestment.com");
  });

  it("returns mock base URL when isMock is true", () => {
    const auth = new KisAuth({ appKey: "key", appSecret: "secret", accountNo: "12345678-01", isMock: true });
    expect(auth.baseUrl).toContain("openapivts.koreainvestment.com");
  });

  it("returns correct trade IDs for production", () => {
    const auth = new KisAuth({ appKey: "key", appSecret: "secret", accountNo: "12345678-01" });
    expect(auth.getTradeId("buy")).toBe("TTTC0802U");
    expect(auth.getTradeId("sell")).toBe("TTTC0801U");
  });

  it("returns correct trade IDs for mock", () => {
    const auth = new KisAuth({ appKey: "key", appSecret: "secret", accountNo: "12345678-01", isMock: true });
    expect(auth.getTradeId("buy")).toBe("VTTC0802U");
    expect(auth.getTradeId("sell")).toBe("VTTC0801U");
  });
});
