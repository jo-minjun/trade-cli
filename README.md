# trade-cli

OpenClaw 에이전트와 연동 가능한 트레이딩 CLI 도구.

AI가 시장 분석과 전략 판단을 담당하고, trade-cli가 주문 실행과 리스크 관리를 담당하는 하이브리드 구조.

## 지원 시장

| 시장 | 거래소/브로커 | 상태 |
|------|-------------|------|
| 크립토 (CEX) | Upbit | 개발 중 |
| 주식 | 한국투자증권 (KIS) | 개발 중 |
| 예측 시장 | Polymarket | 개발 중 |

## 설치

```bash
git clone https://github.com/user/trade-cli.git
cd trade-cli
pnpm install
chmod +x trade
```

## 사용법

```bash
# 초기 설정
trade config init

# 시세 조회
trade cex price BTC-KRW --via upbit
trade stock price 005930 --via kis

# 주문
trade cex buy BTC-KRW 100000 --via upbit
trade stock buy 005930 100000 --via kis
trade prediction buy <market-id> YES 50000 --via polymarket

# 리스크 확인
trade risk status
trade risk check cex BTC-KRW 100000 --via upbit

# 포트폴리오
trade position summary
trade history stats --period 7d

# 손절매 모니터
trade monitor install
trade monitor status
```

## --via 기본값

매번 `--via`를 입력하지 않으려면 기본값을 설정:

```bash
trade config set cex.default-via upbit
trade config set stock.default-via kis
trade config set prediction.default-via polymarket
```

## 리스크 관리

모든 주문은 실행 전 리스크 체크를 자동 수행합니다. AI가 리스크 리미트를 우회할 수 없습니다.

- 단일 주문 크기 제한
- 일일 최대 손실 한도
- 거래소별 배분 한도
- 총 노출도 제한
- 자동 손절매 (모니터 데몬)
- 서킷 브레이커 (연속 손실 시 거래 중단)

## 설정 파일

`~/.trade-cli/config.yaml`에서 API 키와 리스크 파라미터를 관리합니다.

```yaml
risk:
  max-total-capital: 1000000
  max-daily-loss: 50000
  max-order-size: 200000
  max-total-exposure: 0.8
  max-position-ratio: 0.3
```

## 기술 스택

TypeScript, Node.js 22+, commander, better-sqlite3, Vitest, pnpm

## 라이선스

MIT
