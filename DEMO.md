# Demo script — Capital Gambit

Three minutes. Every figure below was produced by an actual run on
`fixtures/`, not written by hand. The dataset is seeded, so a fresh run
reproduces these numbers exactly.

## Before recording

```bash
npm install
rm -rf .data          # start with no run history on screen
npm run build && npm start
```

Open `http://localhost:3000`. Do one full rehearsal run, then `rm -rf .data`
again so the dashboard opens on the empty state.

---

## 1 · The reframe (~25s)

> Most financial planning software asks one question: how do we earn more?
> The Office of the CFO's real lever is different. It's reallocation — moving
> resources that are already on the balance sheet to where they earn more next
> cycle. That's the gambit: a deliberate trade-off now for a stronger position
> later.
>
> Capital Gambit finds capital that's trapped in the working capital cycle, and
> proposes where to put it instead.

Stay on the empty dashboard. Do not click yet.

## 2 · The data (~20s)

Click **Connections**.

> This is Meridian Instruments — a $11.45M industrial distributor. 624 ledger
> rows and 25 vendor contracts. We're honest about provenance: the spreadsheet
> connector is live, the demo ledger is fixture data, and everything else says
> "not connected" rather than pretending.

Point at the **Bank feed (Plaid)** card reading *Not connected*.

> We didn't stub a fake bank feed. Cash position is derived from the ledger, and
> the card says so.

Back to dashboard.

## 3 · Concurrent analysis (~45s)

Click **Run analysis**.

> Four agents dispatch concurrently. Cash and synthesis are live; cost and
> revenue are declared not-live rather than faked.

The strip fills in:

| Metric | Value |
|---|---|
| Days sales outstanding | **39.4** |
| Days payable outstanding | **31.0** |
| Cash conversion cycle | **8.3** |
| Redeployable capital | **$603,470** |

Open the **Cash** panel and read the ranked levers:

| Lever | Frees |
|---|---|
| Collect Northwind Logistics to 30-day terms | **$256,488** |
| Extend Kestrel Freight to 44-day terms | **$110,711** |
| Collect Calder Foods to 30-day terms | **$109,469** |
| Serve notice on Lumen Analytics before renewal | **$96,000** |
| Extend Dunmore Castings to 43-day terms | **$30,801** |

> Three different failure modes, found in the same ledger. Northwind is on
> 30-day terms and pays in 67. Kestrel we pay in 15.8 days when the median
> comparable logistics vendor gets paid at 44 — we are financing our own
> supplier for free. And Lumen renews in 28 days at $96,000, inside the notice
> window, which closes soon.

**The credibility moment — drill into provenance once.** Click the evidence
link on the Kestrel lever.

> Every number opens onto the rows it came from. That 44-day benchmark isn't a
> constant in the code — it's the median of the actual Logistics-category
> vendors in this ledger, and here are their payment rows.

## 4 · Synthesis (~45s)

Scroll to the proposal.

> **Release $603k from the cash conversion cycle and redeploy into additional
> sales capacity for $73k of next-cycle payoff.**

Point at the two-column trade-off — the give and the get side by side.

> It states what you give up, not just what you gain: tighter terms with named
> customers, slower settlement with suppliers we'd been paying early, and $603k
> committed out of discretionary reserve.

Point at the numbered reasoning chain.

> The reasoning is numbered and each step carries its own evidence. Step 1 says
> plainly that only one of three analysis agents returned live results — the
> system reports its own coverage gaps instead of hiding them.
>
> Redeployment options are scored on return, risk and reversibility, weighted
> 60/20/20. Capital is spread across six moves respecting each option's
> absorption capacity, rather than dumping everything into the highest-scoring
> use.

## 5 · Human judgment (~35s)

Edit the first move's amount down, and drop one move with **Remove**.

> The CFO is not a rubber stamp. Amounts are editable, the destination is a
> dropdown, and any move can be dropped.

The button now reads **Approve as modified**. Click it.

> The system proposes. It never executes. Nothing changes until a human signs
> off — and when they overrule it, the correction is recorded against the
> original proposal.

Point at the post-approval position: capital committed, capital left
uncommitted, and the delta versus what was proposed.

## 6 · AO sessions (~10s)

Show the AO desktop sidebar with the named worker sessions, and:

```bash
ao session ls --project capital-gambit
```

> Built end to end with AO — parallel worker sessions against a shared type
> contract, each owning its own slice.

---

## Known limitations — state these, don't hide them

- **Concurrency is real but not visually observable.** The agents are pure
  deterministic computation and the whole run completes in roughly 300ms, so
  there is no meaningful window in which to watch panels resolve one by one.
  We deliberately did not insert artificial delays to manufacture a spinner.
- **Cost and revenue agents are not implemented.** They report `skipped` /
  `not live`, and synthesis states in step 1 of its reasoning that it only had
  one live agent to work from.
- **No bank feed.** Cash position is inferred from the ledger.

## If something breaks on camera

The cut list, in order: Plaid card → stubbed agent panels → provenance
drill-down → run replay. Never cut the cash agent's depth, the synthesis
trade-off, or the human approval step.
