# Capital Gambit — Project Context
### Syndicate by Maximor Hackathon — Track 2: Autonomous Office of the CFO

---

## 1. Hackathon Details
- **Event**: Syndicate by Maximor (hosted by Agent Orchestrator / AO)
- **Track**: Track 2 — Autonomous Office of the CFO
- **Deadline**: Sep 7, 2026 @ 1:00am GMT+3
- **Requirement**: Must be built using AO from start to finish; demo must show the AO sessions used.

### What Track 2 judges are looking for (from organizer clarification)
- A specific, real Office-of-the-CFO workflow — domain depth matters here, unlike Track 1.
- A genuine pain-point for people working in the Office of the CFO.
- Human judgment side of the automation must be "truly intuitive."
- Deep, well-thought-through automation in context of the *specific* workflow — not broad or abstract.
- Grounded enough to be genuinely used by real accountants.

---

## 2. Core Concept

**Name**: Capital Gambit — a multi-agent FP&A system for next-cycle financial resource allocation.

**What it does**: Concurrent, specialized agents each analyze one real financial lever — cash position, cost structure, revenue/forecast — and a synthesis agent recommends concrete resource-reallocation moves for the next financial cycle. The framing: don't just ask "how do we earn more," ask where existing resources should be reallocated now for the largest payoff next cycle.

**Chess reference (light touch)**: the name "Gambit" nods to the idea of a deliberate trade-off now for a stronger position later — reallocating capital from a lower-value use to a higher-value one. This is a naming/framing device only; the product itself is described and demoed in standard financial terms (cash conversion cycle, working capital, cost reduction, forecast variance), not chess language throughout.

---

## 3. Agent Architecture (4 agents, concurrent)

1. **Cash & Working Capital Agent**
   Analyzes AR/AP timing, payment terms, and cash conversion cycle.
   Output: concrete levers — e.g., "extend Vendor X terms by 15 days, accelerate Customer Y collections."

2. **Cost Structure Agent**
   Analyzes recurring spend (subscriptions, vendor contracts up for renewal).
   Output: named cost-reduction opportunities with dollar impact.

3. **Revenue/Forecast Agent**
   Analyzes historical revenue and pipeline data, projects the next cycle, flags forecast drift vs. actuals.
   Output: a forecast with confidence bands, not just a point estimate.

4. **Allocation/Synthesis Agent**
   Takes the outputs of Agents 1–3 and proposes where to redeploy freed-up resources for the best expected payoff.
   Recommendation goes to a human for approval — does not auto-execute.

**Scope note**: given the 30-hour window, consider narrowing to 2 of the 4 agents built well (Cash/Working Capital + Allocation/Synthesis) rather than all 4 shallowly, per organizer advice not to overbuild.

---

## 4. User-Facing Dashboard — App Connections

Users connect their own data sources to feed the system. Realistic, buildable set for the demo:

- **Documents** — contracts, invoices (supporting evidence)
- **Spreadsheets** — CSV / Google Sheets (ledger stand-in)
- **Bank/cash feed** — Plaid sandbox (feeds Cash & Working Capital Agent)
- **Expense/subscription data** — feeds Cost Structure Agent
- **CRM/pipeline export** — CSV of deals/stages (feeds Revenue/Forecast Agent)

**Recommendation**: wire up 2 sources live (spreadsheet + Plaid sandbox), show the rest as "connect" options in the UI to sell the full vision without needing all of them functional.

---

## 5. Demo Notes
- Lead with the reframe: financial planning as active resource reallocation, not just growth-seeking.
- Show each agent's analysis surfaced separately, then the synthesis agent's recommendation with reasoning.
- Emphasize the human-approval step — this is the answer to "human judgment truly intuitive."
- Keep the "gambit"/trade-off framing to the name and one-line pitch; the rest of the demo should use standard financial terminology so the workflow reads as credible to accountants, not gimmicky.

---

## 6. Background Exploration (earlier ideas, kept for reference)

### Independent Auditing Agent concept (considered, not chosen)
- Adversarial separation: preparer agent vs. reviewer agent with different objectives — reviewer's job is "construct the strongest case this number is wrong," not "verify it's correct."
- Collusion detector: flags suspiciously high preparer/reviewer agreement rates.
- Canary injection: seed known synthetic anomalies to measure detection rate live in demo.
- Escalation engine kept deterministic and separate from both agents to avoid incentive-to-downplay at the escalation stage.
- Detection heuristics: **Benford's Law** (leading-digit distribution anomaly detection) + **threshold clustering** (transactions clustering suspiciously near approval limits).
- Real audit "dopamine moments" identified as demo-worthy: Benford deviations, discrepancy-tracing chains, confirmation mismatches, threshold clustering.

### Track 1 alternative (considered, not chosen)
- Domain-agnostic learning-loop agent: routes tasks between cheap/expensive tools, improves triage accuracy over time via self-reflection + persistent memory.
- Demo hook: memory diffs v1→v2→v3, plus a precision/cost/speed chart improving run over run.
- Decided against in favor of Track 2.

### 4-agent audit pipeline (considered, not chosen — superseded by current concept)
- Agent 1: Ingestion & Normalization
- Agent 2: Reconciliation & Detection
- Agent 3: Adversarial Review — conclusions-only visibility into Agent 2's output, to preserve independence
- Agent 4: Escalation & Reporting

---

## 7. Open Questions / To Decide
- Confirm with organizers (Discord) whether AO should be used purely as the *build tool* or as the *runtime* the agents operate in.
- Decide final scope: 2 agents (deep) vs. 4 agents (broader but shallower) given the 30-hour constraint.
- Decide which data sources are live-wired vs. UI-only for the demo.
- Plan the 3-minute demo script early — organizer explicitly warned against last-minute demo videos.

---

## 8. Useful Resources (from organizer)
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://platform.claude.com/docs/en/managed-agents/overview
- https://www.youtube.com/@MaximorAI
- https://www.maximor.ai/
- AO download: https://aoagents.dev/download/