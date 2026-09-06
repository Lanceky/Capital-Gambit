# Capital Gambit — Implementation Plan

> Ten-step build plan derived from `context.md`.
> **Status:** uncommitted, untracked working document.
> **Created:** 2026-09-06 16:20 GMT+3

---

## Time budget — read this first

| Item | Value |
|---|---|
| Now | Sep 6, 2026 · 16:20 GMT+3 |
| Deadline | Sep 7, 2026 · 01:00 GMT+3 |
| **Remaining** | **~8h 40m** |

`context.md` §3 assumes a "30-hour window." That is no longer the case. This
plan is sized for ~8.5 hours with a hard demo-recording cutoff, and it adopts
the narrow scope §3 already recommends: **Cash & Working Capital Agent +
Allocation/Synthesis Agent only.** Agents 2 and 3 (Cost Structure,
Revenue/Forecast) ship as UI-visible but non-live.

**Hard rule:** Step 10 (demo recording) begins at **22:30 GMT+3** regardless of
feature completeness. The organizer explicitly warned against last-minute demo
videos. A working demo of two agents beats a broken demo of four.

### Step 1 decisions — RESOLVED 16:30 GMT+3

Locked by the orchestrator so the build could start. Recorded in
`/home/lance/.ao/data/briefs/capital-gambit/00-shared.md`, which every worker
reads before starting.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind, at the repo root.
- **Persistence:** plain JSON under `.data/`. No `better-sqlite3`, no native
  modules — native builds are too fragile under deadline pressure.
- **Agent logic:** **deterministic financial computation, not LLM calls.** Real
  formulas (DSO/DPO/DIO/CCC) are more credible to accountants than model prose,
  and a demo that depends on live inference can flake on camera. No API key is
  needed anywhere in the project.
- **Scope:** two agents deep (Cash & Working Capital, Allocation/Synthesis).
  Cost Structure and Revenue/Forecast ship as typed, visible, non-live stubs.
- **Connectors:** CSV upload is the live path. Plaid is written against the same
  interface with a sandbox-shaped fixture fallback, badged honestly in the UI.
- **Workflow:** no pull requests. Workers push straight to `main` and rebase —
  PR review round-trips do not fit the remaining budget.

**Unresolved, labelled rather than guessed:** whether the organizers require AO
to be the agent *runtime* or only the *build tool* (`context.md` §7). Could not
verify — no Discord access from this session. Proceeding on the build-tool
reading, with agent orchestration implemented in-app and the AO sessions
captured on camera to satisfy the "built with AO" requirement either way.

---

## The ten steps

### Step 1 — Lock scope and resolve blockers · 25m · 16:20–16:45
Close every open question in `context.md` §7 before any code is written.
- Confirm via Discord whether AO must be the agent **runtime** or only the
  **build tool**. This changes Step 7 materially.
- Freeze scope at 2 live agents. Write the decision down; do not revisit.
- Confirm stack and persistence choices above.
- Confirm which connectors are live (spreadsheet + Plaid sandbox) vs. UI-only.
**Done when:** a written decision list exists and no step below is blocked.

---

### Step 2 — Repo scaffold · 30m · 16:45–17:15
Stand up the skeleton so parallel workers stop colliding.
- App scaffold, TypeScript config, formatter, `.gitignore`.
- Directory layout: `agents/`, `connectors/`, `lib/`, `app/`, `fixtures/`.
- Shared type definitions for `AgentFinding`, `Lever`, `Recommendation`,
  `RunRecord` — every later step depends on these contracts.
- One commit, pushed, so workers branch from a common base.
**Done when:** app boots locally and shared types are importable.

---

### Step 3 — Fixture dataset · 30m · 17:15–17:45 · *parallel with Step 4*
Build the synthetic company the demo runs against. Credibility to accountants
lives or dies here.
- 12 months of AR/AP ledger CSV with realistic aging buckets and payment terms.
- Vendor contract list with renewal dates and annual values.
- A deliberately planted, defensible story: one vendor on bad terms, one
  slow-paying customer, one renewal worth cancelling.
**Done when:** the data alone tells the story the synthesis agent will find.

---

### Step 4 — Connector layer · 60m · 17:45–18:45
- **Live:** CSV / spreadsheet upload and parse into the ledger schema.
- **Live:** Plaid sandbox — auth handshake, pull transactions, normalize.
- **UI-only:** documents, expenses, CRM export rendered as "Connect" cards.
- Normalize everything into one internal schema so agents never touch a
  source-specific shape.
**Done when:** both live sources land in the same normalized store.

---

### Step 5 — Cash & Working Capital Agent · 90m · 18:00–19:30 · *parallel*
The depth agent. This is what "domain depth" is judged on.
- Compute cash conversion cycle: DSO, DPO, DIO.
- Analyze AR aging and AP payment-term slack.
- Emit **named, concrete levers** with dollar and days-of-cash impact —
  "extend Vendor X terms 15 days → $42k freed," not generic advice.
- Every finding carries its source rows so the UI can show provenance.
**Done when:** it produces defensible levers against the Step 3 fixtures.

---

### Step 6 — Allocation / Synthesis Agent · 60m · 19:30–20:30
- Consume Step 5 findings (plus stubbed outputs for the two non-live agents so
  the interface is real and future-proof).
- Rank redeployment options by expected next-cycle payoff.
- Produce one clear recommendation with an explicit trade-off statement — the
  "gambit": what is given up now, what is gained next cycle.
- Emit reasoning as structured steps, not prose, so the UI can render it.
- **Never auto-executes.** Output is always a proposal.
**Done when:** it returns a ranked recommendation with visible reasoning.

---

### Step 7 — Orchestration and run records · 60m · 20:00–21:00 · *parallel*
- Run the analysis agents **concurrently**, then gate the synthesis agent on
  their completion. Concurrency is a stated part of the concept — make it real
  and make it visible in the UI.
- Persist a `RunRecord`: inputs, per-agent findings, synthesis output, timings.
- Wire to the AO runtime if Step 1 determined AO is the runtime.
**Done when:** one trigger produces a complete, replayable run record.

---

### Step 8 — Dashboard · 150m · 19:00–21:30 · *parallel, start early*
The judged surface. Start before the agents are finished; wire to fixtures.
- **Connections page** — live sources active, others as "Connect" cards.
- **Per-agent panels** — each agent's analysis surfaced *separately*, with
  provenance drill-down to source rows.
- **Synthesis panel** — the recommendation, the trade-off, the reasoning chain.
- Concurrency made visible: agents resolving in parallel, not a spinner.
**Done when:** a full run is legible end-to-end without narration.

---

### Step 9 — Human approval and audit trail · 45m · 21:30–22:15
This is the direct answer to "human judgment must be truly intuitive." Do not
cut this step; cut a connector instead.
- Approve / reject / **modify-then-approve** on each recommended move.
- Modification is the differentiator — let the CFO change the number and
  record that they did.
- Persist decision, actor, timestamp, and rationale to the run record.
- Show the resulting post-approval position.
**Done when:** a decision is captured, persisted, and visibly changes state.

---

### Step 10 — Demo, submission, buffer · 22:30–01:00 · **hard start 22:30**
- Seed the demo scenario and rehearse once end-to-end.
- 3-minute script: reframe (reallocation, not growth-seeking) → concurrent
  agent analyses → synthesis with trade-off → human approval.
- **Record the AO sessions used** — this is a submission requirement, not a
  nice-to-have. Capture the session list and worker output on screen.
- Record, review once, submit. Keep the final 30m as pure buffer.
**Done when:** the video is submitted, not merely rendered.

---

## Parallelization map

Roughly four AO worker tracks after Step 2 lands:

| Track | Steps |
|---|---|
| Data | 3 → 4 |
| Agents | 5 → 6 |
| Runtime | 7 |
| Frontend | 8 → 9 |

Steps 1, 2, and 10 are serial and gate everything around them.

## Cut list, in order

If time runs short, drop in this sequence — never reorder:
1. Plaid sandbox connector (fall back to CSV only)
2. Stubbed outputs for the two non-live agents
3. Provenance drill-down in the UI
4. Run-record replay

**Never cut:** the Cash agent's depth (Step 5), the synthesis trade-off
(Step 6), human approval (Step 9), or the demo recording (Step 10).
