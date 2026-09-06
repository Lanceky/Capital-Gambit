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

Open [http://localhost:3000](http://localhost:3000) and click **Run analysis**. The
app ships with a fixture dataset, so it works with no configuration, no API keys
and no external services.

## Build

```bash
npm run build
```

## What actually runs

The demo dataset is Meridian Instruments, a $11.45M industrial distributor:
624 ledger rows and 25 vendor contracts. A full run completes in roughly 300ms
and produces:

| | |
|---|---|
| Days sales outstanding | 39.4 |
| Days payable outstanding | 31.0 |
| Cash conversion cycle | 8.3 days |
| Redeployable capital identified | $603,470 |

The **cash agent** computes DSO/DPO/DIO/CCC and AR aging, then derives four
families of lever: receivables running past agreed terms, suppliers being paid
faster than their category peers, early-payment discounts worth less than the
cost of capital, and contract renewals still inside their notice window. The
peer benchmark is the median of same-category vendors *in your ledger* — it is
computed, not hardcoded.

The **synthesis agent** scores redeployment options on return, risk and
reversibility weighted 60/20/20, then allocates the freed capital across them by
drawing down each lever, so the moves always sum to exactly the capital
identified and no move can cite more than its lever released.

Every finding, lever and reasoning step carries `SourceRef` row ids. Clicking any
figure opens the actual ledger and contract rows behind it.

## Connecting your own spreadsheet

Drop an Excel workbook (`.xlsx`) or a CSV on the **Connections** page. An accepted file becomes the active
dataset immediately — every subsequent analysis run and every provenance
drill-down reads it instead of the bundled fixtures, and the header shows which
dataset is in use.

- **Ledger export** (required): `kind`, `counterparty`, `amountUsd`, plus
  `date`, `dueDate`, `paidDate` and `termsDays` where available.
- **Contract export** (optional): `vendor`, `annualValueUsd`, renewal and notice
  dates. Without it, renewal levers cannot be identified and the UI says so.
- **Company profile** (optional): revenue, COGS, cash balance and cost of
  capital, either as JSON or as a worksheet with those column headings and a
  single row of values. Without it these are inferred from ledger activity, and
  the inferred fields are labelled as such rather than presented as reported
  figures.

These can arrive as separate files or as tabs of one workbook — each worksheet
is classified on its own contents. Tabs that match nothing (cover sheets,
working notes) are skipped and named in the upload result rather than failing
the file. `public/sample-workbook.xlsx` is a three-tab example, downloadable
from the Connections page.

Column naming is tolerant of common spellings, and validation failures name the
offending row and column. **Disconnect** reverts to the demo ledger.

`.xlsx` is read by a small dependency-free reader in `lib/xlsx.ts` — a workbook
is a ZIP of XML, and Node ships `zlib`. It decodes every worksheet, resolves
shared strings, and converts Excel serial dates to ISO. This avoids the npm
build of `xlsx`, which carries unpatched prototype-pollution and ReDoS
advisories. Anything the reader cannot handle is reported with a "re-export as
CSV" message rather than misparsed.

## Human approval

Nothing executes. The recommendation is a proposal: amounts are editable, the
destination is a dropdown, and any move can be dropped. Approving as modified
records the correction against the original proposal and shows the resulting
position — capital committed, capital left uncommitted, and the delta versus what
was recommended.

## Honest scope

- **Cash and synthesis agents are live.** Cost and revenue report `skipped` /
  `not live`, and synthesis states its own coverage gap in step 1 of its
  reasoning rather than presenting partial analysis as complete.
- **No bank feed.** The connections page reads "Not connected" for Plaid; cash
  position is derived from the ledger.
- **Concurrency is genuine but not visually observable.** Agents are pure
  deterministic computation and finish in well under a millisecond, so there is
  no window in which to watch panels resolve one by one. No artificial delays
  were added to manufacture one.

## Demo

`DEMO.md` contains the timed three-minute script, the click path, and the
verified figures it depends on. The fixture generator is seeded, so a fresh run
reproduces those numbers exactly — regenerating fixtures means updating both
`DEMO.md` and `fixtures/README.md`.
