# trade-cli 설계 문서

## 개요

OpenClaw 에이전트와 연동 가능한 경량 트레이딩 CLI 도구. AI가 시장 분석과 전략 판단을 담당하고, trade-cli가 주문 실행과 리스크 관리를 담당하는 하이브리드 구조.

## 목표

- 크립토(Upbit), 주식(한국투자증권), 예측 시장(Polymarket) 세 시장 지원
- 코드 레벨 리스크 관리로 자본 보호
- 완전 자동 트레이딩 지원 (OpenClaw 스킬 연동은 후속 작업)
- 초기 자본 100만원, 점진적 확대

## 아키텍처

```
OpenClaw 세션 (향후 연동)
  │
  ▼
trade CLI
  ├── commands/        # CLI 명령어
  ├── exchanges/       # 거래소별 API 어댑터
  │   ├── upbit        # Upbit REST API
  │   ├── kis          # 한국투자증권 KIS API
  │   └── polymarket   # Polymarket API (Polygon)
  ├── risk/            # 리스크 매니저
  ├── monitor/         # 손절매 모니터 데몬 (launchd)
  └── db/              # SQLite 거래 기록
```

## 프로젝트 구조

```
~/Projects/me/trade-cli/
├── trade                # CLI 엔트리포인트
├── src/
│   ├── commands/        # CLI 명령어
│   ├── exchanges/       # 거래소별 API 어댑터
│   ├── risk/            # 리스크 매니저
│   ├── monitor/         # 손절매 모니터
│   └── db/              # SQLite
├── tests/
├── package.json
├── tsconfig.json
└── docs/
    └── plans/
```

## CLI 명령어

### 거래소별 명령어

```bash
# ── 크립토 (CEX) ──
trade cex buy <symbol> <amount> --via <exchange> [--type limit --price <price>]
trade cex sell <symbol> <amount> --via <exchange> [--type limit --price <price>]
trade cex cancel <order-id> --via <exchange>
trade cex balance --via <exchange>
trade cex price <symbol> --via <exchange>
trade cex orderbook <symbol> --via <exchange>
trade cex candles <symbol> --via <exchange> [--interval 1h]

# ── 주식 ──
trade stock buy <symbol> <amount> --via <broker>
trade stock sell <symbol> <amount> --via <broker>
trade stock cancel <order-id> --via <broker>
trade stock balance --via <broker>
trade stock price <symbol> --via <broker>
trade stock info <symbol> --via <broker>

# ── 예측 시장 ──
trade prediction markets --via <platform> [--query <keyword>]
trade prediction market <market-id> --via <platform>
trade prediction buy <market-id> <outcome> <amount> --via <platform>
trade prediction sell <market-id> <outcome> <amount> --via <platform>
trade prediction positions --via <platform>
```

### 공통 명령어

```bash
# ── 리스크 관리 ──
trade risk check <market-type> <symbol> <amount> --via <exchange>
trade risk status
trade risk set <key> <value>
trade risk reset-circuit-breaker

# ── 포지션/포트폴리오 ──
trade position summary

# ── 거래 기록 ──
trade history list [--via <exchange>] [--from <date>] [--limit <n>]
trade history stats [--period <duration>]
trade history export [--format csv]

# ── 모니터 (손절매 데몬) ──
trade monitor install       # LaunchAgent plist 설치 + 시작
trade monitor uninstall     # LaunchAgent 제거
trade monitor start
trade monitor stop
trade monitor status

# ── 설정 ──
trade config init
trade config show
trade config set <key> <value>
```

### --via 기본값 설정

```bash
trade config set cex.default-via upbit
trade config set stock.default-via kis
trade config set prediction.default-via polymarket

# 이후 --via 생략 가능
trade cex buy BTC-KRW 100000
```

## 리스크 관리

### 원칙

- 모든 주문은 실행 전 리스크 체크를 자동 수행
- AI가 리스크 리미트를 우회할 수 없음
- 리스크 파라미터는 합리적 기본값 제공 + 사용자 설정 가능

### 리스크 체크 흐름

```
주문 요청
  → 1. 일일 손실 한도 확인
  → 2. 단일 주문 크기 확인
  → 3. 단일 포지션 비율 확인
  → 4. 거래소별 배분 한도 확인
  → 5. 총 노출도 확인
  → 모두 통과 시 주문 실행 / 하나라도 실패 시 거부
```

### 자동 손절매

`trade monitor`가 주기적으로 (30초 간격) 보유 포지션을 체크하여 stop-loss 기준 초과 시 자동 시장가 매도.

### 서킷 브레이커

연속 N회 손실 발생 시 설정된 시간 동안 신규 주문을 자동 거부.
`trade risk reset-circuit-breaker`로 수동 해제 가능.

## 데이터 저장소

### SQLite 스키마

```sql
-- 주문 기록
orders (
  id, market_type, via, symbol, side, type,
  amount, price, filled_amount, filled_price,
  status, created_at, updated_at
)

-- 포지션 (현재 보유)
positions (
  id, market_type, via, symbol,
  quantity, avg_entry_price, current_price,
  unrealized_pnl, created_at, updated_at
)

-- 일일 손익 집계
daily_pnl (
  date, market_type, via,
  realized_pnl, trade_count, win_count
)

-- 리스크 이벤트 로그
risk_events (
  id, event_type, details, created_at
)
```

### 파일 위치

- 설정: `~/.trade-cli/config.yaml`
- DB: `~/.trade-cli/trade.db`
- 로그: `~/.trade-cli/logs/`

## 설정 파일

```yaml
# ~/.trade-cli/config.yaml

cex:
  default-via: upbit
  upbit:
    api-key: ""
    secret-key: ""

stock:
  default-via: kis
  kis:
    app-key: ""
    app-secret: ""
    account-no: ""

prediction:
  default-via: polymarket
  polymarket:
    private-key: ""

risk:
  max-total-capital: 1000000
  max-daily-loss: 50000
  max-total-exposure: 0.8
  max-order-size: 200000
  max-position-ratio: 0.3
  circuit-breaker:
    consecutive-losses: 5
    cooldown-minutes: 60
  cex:
    max-allocation: 400000
    stop-loss: 0.05
  stock:
    max-allocation: 400000
    stop-loss: 0.03
  prediction:
    max-allocation: 200000
    stop-loss: 0.1
```

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 언어 | TypeScript (Node.js) | OpenClaw와 동일 런타임 |
| CLI 프레임워크 | commander | 서브커맨드 지원, OpenClaw과 동일 |
| DB | SQLite (better-sqlite3) | 로컬 파일, 별도 서버 불필요 |
| HTTP 클라이언트 | undici | Node.js 내장 |
| 설정 파일 | YAML (yaml 패키지) | 가독성 좋음 |
| 테스트 | Vitest | OpenClaw와 동일 |
| 패키지 매니저 | pnpm | OpenClaw와 동일 |
| 빌드 | tsdown | OpenClaw와 동일 |
| 백그라운드 | launchd (LaunchAgent) | macOS 네이티브, 재부팅 시 자동 시작 |

## 향후 확장

- OpenClaw 스킬 연동 (시장별 SKILL.md 작성)
- 백테스팅 프레임워크
- WebSocket 실시간 데이터 스트림
- 대시보드 UI
