# Fixtures — Meridian Instruments

The synthetic company the demo runs against. Everything the agents report is
computed from these three files; nothing is hardcoded in agent code.

## Files

| File | Contents |
|---|---|
| `ledger.csv` | 624 AR and AP invoices across 12 months (324 AR, 300 AP, 28 still open) |
| `contracts.csv` | 25 vendor contracts with renewal dates spread over the next 12 months |
| `company.json` | Revenue, COGS, opex, cash balance and cost of capital |

## Company profile

Meridian Instruments — a B2B industrial instrumentation supplier.

| Figure | Value |
|---|---|
| Annual revenue | $11,452,285 |
| COGS | $7,657,238 |
| Gross margin | 33.1% |
| Operating expense | $3,274,521 |
| Cash balance | $1,480,000 |
| Cost of capital | 9% |
| Inventory | $0 (assembly is outsourced) |

Revenue and COGS are the actual sums of the AR and cost-of-sales AP rows in
`ledger.csv`, so the ratios the agents compute reconcile to the ledger.
Facilities, software, professional services, insurance and equipment spend is
operating expense, not COGS.

## Working capital position

Derived by the cash agent from the ledger, as of 2026-10-05:

| Metric | Value |
|---|---|
| DSO | 39.4 days |
| DPO | 31.0 days |
| DIO | 0.0 days |
| **CCC** | **8.3 days** |
| Open AR | $472,042 |
| Open AP | $201,443 |

AR aging: $179,366 at 1–30 days past due, $245,299 at 31–60, $47,377 at 61–90.

## The planted story

Three findings are present arithmetically and must be discoverable by
computation alone.

### 1. A slow-paying customer — Northwind Logistics

Pays at roughly 67 days against 30-day terms, every month, on ~$183k of monthly
billings. The gap is visible in the `paidDate` minus `date` of each invoice.

**Expected lever: $256,488** — 37.3 excess days × average daily billings.

A second, smaller late payer (**Calder Foods**, ~55 days against 30-day terms)
exists so the pattern is a pattern rather than a single outlier.

**Expected lever: $109,469.**

### 2. A vendor paid too fast — Kestrel Freight

Settled at ~15 days on 45-day terms. The other Logistics vendors — Halden
Transport, Verity Carriers, Tallow Bay Shipping — are all paid at ~45 days, so
the peer benchmark is derivable from the data rather than asserted.

**Expected lever: $110,711** — 29.5 additional days × average daily spend.

A smaller instance (**Dunmore Castings**, Raw Materials) yields **$30,801**.

### 3. A renewal worth cancelling — Lumen Analytics

A $96,000/year Software contract renewing in 28 days, cancellable on 14 days
notice, carrying a `utilizationPct` of 12 — the lowest utilization of any
contract in the file, which is what makes the recommendation defensible rather
than arbitrary.

**Expected lever: $96,000.**

## Total redeployable capital

**$603,470** across five levers.

The synthesis agent sums these and proposes redeployment, leading with
additional sales capacity (18% expected return) and directing the remainder to
revolver paydown at the 9% cost of capital.

## Noise

The file is mostly unremarkable: 25 further customers paying near terms with a
normal late tail, 24 vendors settled at or near contractual terms, and contracts
with high utilization or renewal dates far outside any notice window. If every
row were a finding the dataset would not be credible.

## Regenerating

The data is produced by a seeded generator, so the planted arithmetic is stable
across regenerations. Revenue follows a seasonal shape — an industrial demand
dip mid-summer and a Q4 peak — rather than being flat month to month.
