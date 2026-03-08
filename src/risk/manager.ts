import type Database from "better-sqlite3";
import type { RiskConfig } from "../config/types.js";
import { PositionRepository, DailyPnlRepository, RiskEventRepository, CircuitBreakerRepository } from "../db/repository.js";

export interface RiskCheckInput {
  market_type: "cex" | "stock" | "prediction";
  via: string;
  symbol: string;
  side: "buy" | "sell";
  amount: number;
}

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
}

export class RiskManager {
  private positionRepo: PositionRepository;
  private pnlRepo: DailyPnlRepository;
  private eventRepo: RiskEventRepository;
  private cbRepo: CircuitBreakerRepository;
  private circuitBreakerActive = false;
  private circuitBreakerUntil: Date | null = null;
  private consecutiveLosses = 0;

  constructor(
    private config: RiskConfig,
    db: Database.Database,
  ) {
    this.positionRepo = new PositionRepository(db);
    this.pnlRepo = new DailyPnlRepository(db);
    this.eventRepo = new RiskEventRepository(db);
    this.cbRepo = new CircuitBreakerRepository(db);
    this.restoreState();
  }

  private restoreState(): void {
    const row = this.cbRepo.load();
    if (!row) return;
    this.circuitBreakerActive = row.active === 1;
    this.circuitBreakerUntil = row.until_iso ? new Date(row.until_iso) : null;
    this.consecutiveLosses = row.consecutive_losses;
  }

  private persistState(): void {
    this.cbRepo.save(
      this.circuitBreakerActive,
      this.circuitBreakerUntil?.toISOString() ?? null,
      this.consecutiveLosses,
    );
  }

  check(input: RiskCheckInput): RiskCheckResult {
    // Sell orders bypass risk checks
    if (input.side === "sell") {
      return { approved: true };
    }

    // 1. Circuit breaker check
    if (this.isCircuitBreakerActive()) {
      this.eventRepo.log("rejected", `Circuit breaker active: ${input.symbol} ${input.amount}`);
      return { approved: false, reason: "Trading halted: circuit breaker is active" };
    }

    // 2. Max order size check
    if (input.amount > this.config["max-order-size"]) {
      this.eventRepo.log("rejected", `Order size exceeded: ${input.amount} > ${this.config["max-order-size"]}`);
      return { approved: false, reason: `Max order size exceeded (${input.amount} > ${this.config["max-order-size"]})` };
    }

    // 3. Daily loss limit check (considering potential loss from stop-loss)
    const today = new Date().toISOString().split("T")[0];
    const todayPnl = this.pnlRepo.getTodayTotalPnl(today);
    const marketConfig = this.config[input.market_type];
    const potentialLoss = input.amount * marketConfig["stop-loss"];
    const realizedLoss = Math.abs(Math.min(0, todayPnl));
    if (realizedLoss + potentialLoss >= this.config["max-daily-loss"]) {
      this.eventRepo.log("rejected", `Daily loss limit reached: current=${todayPnl}, potential=${potentialLoss}`);
      return { approved: false, reason: `Max daily loss limit exceeded (current loss: ${realizedLoss}, potential: ${potentialLoss}, limit: ${this.config["max-daily-loss"]})` };
    }

    // 4. Market allocation limit check
    const currentExposure = this.positionRepo.totalExposureByMarketType(input.market_type);
    if (currentExposure + input.amount > marketConfig["max-allocation"]) {
      this.eventRepo.log("rejected", `Allocation exceeded: ${input.market_type} ${currentExposure + input.amount} > ${marketConfig["max-allocation"]}`);
      return { approved: false, reason: `${input.market_type} allocation limit exceeded (current: ${currentExposure}, adding: ${input.amount}, limit: ${marketConfig["max-allocation"]})` };
    }

    // 5. Total exposure check
    const totalExposure = this.positionRepo.totalExposure();
    const maxExposure = this.config["max-total-capital"] * this.config["max-total-exposure"];
    if (totalExposure + input.amount > maxExposure) {
      this.eventRepo.log("rejected", `Total exposure exceeded: ${totalExposure + input.amount} > ${maxExposure}`);
      return { approved: false, reason: `Total exposure limit exceeded (current: ${totalExposure}, adding: ${input.amount}, limit: ${maxExposure})` };
    }

    // 6. Single position ratio check
    const maxPositionSize = this.config["max-total-capital"] * this.config["max-position-ratio"];
    const existingPosition = this.positionRepo.findBySymbol(input.market_type, input.via, input.symbol);
    const positionTotal = (existingPosition ? existingPosition.quantity * existingPosition.avg_entry_price : 0) + input.amount;
    if (positionTotal > maxPositionSize) {
      this.eventRepo.log("rejected", `Position ratio exceeded: ${positionTotal} > ${maxPositionSize}`);
      return { approved: false, reason: `Single position ratio exceeded (${positionTotal} > ${maxPositionSize})` };
    }

    return { approved: true };
  }

  recordLoss(): void {
    this.consecutiveLosses++;
    if (this.consecutiveLosses >= this.config["circuit-breaker"]["consecutive-losses"]) {
      this.activateCircuitBreaker();
    } else {
      this.persistState();
    }
  }

  recordWin(): void {
    this.consecutiveLosses = 0;
    this.persistState();
  }

  activateCircuitBreaker(): void {
    this.circuitBreakerActive = true;
    this.circuitBreakerUntil = new Date(Date.now() + this.config["circuit-breaker"]["cooldown-minutes"] * 60 * 1000);
    this.eventRepo.log("circuit_breaker", `Circuit breaker activated. Expires: ${this.circuitBreakerUntil.toISOString()}`);
    this.persistState();
  }

  resetCircuitBreaker(): void {
    this.circuitBreakerActive = false;
    this.circuitBreakerUntil = null;
    this.consecutiveLosses = 0;
    this.persistState();
  }

  isCircuitBreakerActive(): boolean {
    if (!this.circuitBreakerActive) return false;
    if (this.circuitBreakerUntil && new Date() > this.circuitBreakerUntil) {
      this.resetCircuitBreaker();
      return false;
    }
    return true;
  }

  status(): { circuitBreaker: boolean; consecutiveLosses: number; circuitBreakerUntil: string | null } {
    return {
      circuitBreaker: this.isCircuitBreakerActive(),
      consecutiveLosses: this.consecutiveLosses,
      circuitBreakerUntil: this.circuitBreakerUntil?.toISOString() ?? null,
    };
  }
}
