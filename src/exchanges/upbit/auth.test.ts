import { describe, it, expect } from "vitest";
import { createUpbitToken } from "./auth.js";

describe("Upbit auth", () => {
  it("creates JWT token without query", () => {
    const token = createUpbitToken("test-access-key", "test-secret-key");
    expect(token).toMatch(/^eyJ/); // JWT format
  });

  it("creates JWT token with query parameters", () => {
    const token = createUpbitToken("test-access-key", "test-secret-key", "market=KRW-BTC&side=bid");
    expect(token).toMatch(/^eyJ/);
  });
});
