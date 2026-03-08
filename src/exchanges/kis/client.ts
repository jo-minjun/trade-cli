import { KisAuth } from "./auth.js";
import type {
  Exchange,
  Ticker,
  Orderbook,
  Candle,
  Balance,
  OrderRequest,
  OrderResponse,
} from "../types.js";

export interface StockInfo {
  symbol: string;
  name: string;
  market: string;
  sector: string;
  per: number | null;
  pbr: number | null;
  marketCap: number | null;
}

function validateStockSymbol(symbol: string): void {
  if (!/^\d{6}$/.test(symbol)) {
    throw new Error(`Invalid stock symbol: ${symbol}. Must be a 6-digit number.`);
  }
}

export class KisExchange implements Exchange {
  name = "kis";
  private auth: KisAuth;

  constructor(
    appKey: string,
    appSecret: string,
    accountNo: string,
    isMock = false,
  ) {
    this.auth = new KisAuth({ appKey, appSecret, accountNo, isMock });
  }

  private async fetchApi(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<unknown> {
    const token = await this.auth.getAccessToken();
    const url = `${this.auth.baseUrl}${path}`;
    const allHeaders: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: this.auth.appKey,
      appsecret: this.auth.appSecret,
      ...headers,
    };

    const options: RequestInit = { method, headers: allHeaders };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    if (!res.ok)
      throw new Error(`KIS API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getPrice(symbol: string): Promise<Ticker> {
    validateStockSymbol(symbol);
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
    });
    const data = (await this.fetchApi(
      "GET",
      `/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
      { tr_id: "FHKST01010100" },
    )) as any;
    const o = data.output;
    return {
      symbol,
      price: parseInt(o.stck_prpr),
      change: parseInt(o.prdy_vrss),
      changeRate: parseFloat(o.prdy_ctrt) / 100,
      volume24h: parseInt(o.acml_vol),
      high24h: parseInt(o.stck_hgpr),
      low24h: parseInt(o.stck_lwpr),
      timestamp: Date.now(),
    };
  }

  async getOrderbook(symbol: string): Promise<Orderbook> {
    validateStockSymbol(symbol);
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
    });
    const data = (await this.fetchApi(
      "GET",
      `/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn?${params}`,
      { tr_id: "FHKST01010200" },
    )) as any;
    const o = data.output1;
    const asks = [];
    const bids = [];
    for (let i = 1; i <= 10; i++) {
      asks.push({
        price: parseInt(o[`askp${i}`]),
        size: parseInt(o[`askp_rsqn${i}`]),
      });
      bids.push({
        price: parseInt(o[`bidp${i}`]),
        size: parseInt(o[`bidp_rsqn${i}`]),
      });
    }
    return { symbol, asks, bids, timestamp: Date.now() };
  }

  async getCandles(
    symbol: string,
    _interval: string,
    _count = 50,
  ): Promise<Candle[]> {
    validateStockSymbol(symbol);
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
      FID_INPUT_DATE_1: today,
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0",
    });
    const data = (await this.fetchApi(
      "GET",
      `/uapi/domestic-stock/v1/quotations/inquire-daily-price?${params}`,
      { tr_id: "FHKST01010400" },
    )) as any;
    return (data.output || []).map((c: any) => ({
      timestamp: new Date(
        c.stck_bsop_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      ).getTime(),
      open: parseInt(c.stck_oprc),
      high: parseInt(c.stck_hgpr),
      low: parseInt(c.stck_lwpr),
      close: parseInt(c.stck_clpr),
      volume: parseInt(c.acml_vol),
    }));
  }

  async getBalance(): Promise<Balance[]> {
    const [acctPrefix, acctSuffix] = this.auth.accountNo.split("-");
    const data = (await this.fetchApi(
      "GET",
      `/uapi/domestic-stock/v1/trading/inquire-balance?CANO=${acctPrefix}&ACNT_PRDT_CD=${acctSuffix}&AFHR_FLPR_YN=N&OFL_YN=&INQR_DVSN=02&UNPR_DVSN=01&FUND_STTL_ICLD_YN=N&FNCG_AMT_AUTO_RDPT_YN=N&PRCS_DVSN=01&CTX_AREA_FK100=&CTX_AREA_NK100=`,
      { tr_id: "TTTC8434R" },
    )) as any;

    return (data.output1 || []).map((item: any) => ({
      currency: item.pdno,
      available: parseInt(item.ord_psbl_qty),
      locked: parseInt(item.hldg_qty) - parseInt(item.ord_psbl_qty),
      avgBuyPrice: parseFloat(item.pchs_avg_pric),
    }));
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    const [acctPrefix, acctSuffix] = this.auth.accountNo.split("-");
    const trId = this.auth.getTradeId(order.side);
    const body = {
      CANO: acctPrefix,
      ACNT_PRDT_CD: acctSuffix,
      PDNO: order.symbol,
      ORD_DVSN: order.type === "market" ? "01" : "00",
      ORD_QTY: String(order.amount),
      ORD_UNPR: order.type === "limit" ? String(order.price!) : "0",
    };

    const hashkey = await this.auth.getHashkey(body);
    const data = (await this.fetchApi(
      "POST",
      "/uapi/domestic-stock/v1/trading/order-cash",
      { tr_id: trId, hashkey },
      body,
    )) as any;

    return {
      id: data.output?.ODNO || data.output?.odno || "unknown",
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status: "pending",
      amount: order.amount,
      price: order.price ?? null,
      filledAmount: 0,
      filledPrice: null,
      createdAt: new Date().toISOString(),
    };
  }

  async cancelOrder(orderId: string): Promise<OrderResponse> {
    const [acctPrefix, acctSuffix] = this.auth.accountNo.split("-");
    const body = {
      CANO: acctPrefix,
      ACNT_PRDT_CD: acctSuffix,
      KRX_FWDG_ORD_ORGNO: "",
      ORGN_ODNO: orderId,
      ORD_DVSN: "00",
      RVSE_CNCL_DVSN_CD: "02",
      ORD_QTY: "0",
      ORD_UNPR: "0",
      QTY_ALL_ORD_YN: "Y",
    };

    await this.fetchApi(
      "POST",
      "/uapi/domestic-stock/v1/trading/order-rvsecncl",
      { tr_id: this.auth.getTradeId("sell").replace("01U", "04U") },
      body,
    );

    return {
      id: orderId,
      symbol: "",
      side: "buy",
      type: "limit",
      status: "cancelled",
      amount: 0,
      price: null,
      filledAmount: 0,
      filledPrice: null,
      createdAt: new Date().toISOString(),
    };
  }

  async getOrder(orderId: string): Promise<OrderResponse> {
    // KIS doesn't have a direct single order query; return minimal info
    return {
      id: orderId,
      symbol: "",
      side: "buy",
      type: "limit",
      status: "pending",
      amount: 0,
      price: null,
      filledAmount: 0,
      filledPrice: null,
      createdAt: new Date().toISOString(),
    };
  }

  async getOpenOrders(_symbol?: string): Promise<OrderResponse[]> {
    return [];
  }

  async getStockInfo(symbol: string): Promise<StockInfo> {
    validateStockSymbol(symbol);
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
    });
    const data = (await this.fetchApi(
      "GET",
      `/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
      { tr_id: "FHKST01010100" },
    )) as any;
    const o = data.output;
    return {
      symbol,
      name: o.hts_kor_isnm || "",
      market: "KOSPI",
      sector: "",
      per: o.per ? parseFloat(o.per) : null,
      pbr: o.pbr ? parseFloat(o.pbr) : null,
      marketCap: o.hts_avls ? parseInt(o.hts_avls) * 100000000 : null,
    };
  }
}
