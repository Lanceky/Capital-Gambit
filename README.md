# Capital Gambit

Multi-agent FP&A (financial planning & analysis) system for the Autonomous Office of the CFO.

The reframe: don't ask "how do we earn more" — ask **where should existing resources be reallocated now for the largest payoff next cycle.**

Specialized agents each analyze one real financial lever (cash position, cost structure, revenue forecast) concurrently. A synthesis agent then recommends concrete resource-**reallocation** moves for the next financial cycle. A human approves before anything executes.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Plain JSON file persistence under `.data/` — no database, no native modules
- Deterministic financial computation (no LLM API required)

## How to run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```
