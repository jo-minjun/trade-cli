const PROD_BASE_URL = "https://openapi.koreainvestment.com:9443";
const MOCK_BASE_URL = "https://openapivts.koreainvestment.com:29443";

export interface KisAuthConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
  isMock?: boolean;
}

export class KisAuth {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  readonly baseUrl: string;

  constructor(private config: KisAuthConfig) {
    this.baseUrl = config.isMock ? MOCK_BASE_URL : PROD_BASE_URL;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }
    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: this.config.appKey,
        appsecret: this.config.appSecret,
      }),
    });

    if (!res.ok) throw new Error(`KIS token error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };
    this.accessToken = data.access_token;
    // Refresh 6 hours before expiry for safety
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 21600) * 1000);
    return this.accessToken;
  }

  async getHashkey(body: Record<string, string>): Promise<string> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/uapi/hashkey`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        appkey: this.config.appKey,
        appsecret: this.config.appSecret,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`KIS hashkey error: ${res.status}`);
    const data = (await res.json()) as { HASH: string };
    return data.HASH;
  }

  getTradeId(side: "buy" | "sell"): string {
    if (this.config.isMock) {
      return side === "buy" ? "VTTC0802U" : "VTTC0801U";
    }
    return side === "buy" ? "TTTC0802U" : "TTTC0801U";
  }

  get accountNo(): string {
    return this.config.accountNo;
  }

  get appKey(): string {
    return this.config.appKey;
  }

  get appSecret(): string {
    return this.config.appSecret;
  }
}
