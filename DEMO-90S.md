# Capital Gambit — 90-second demo

Voiceover script for AI narration, plus a screen-recording shot list.

Every figure below came from an actual run against `fixtures/`. The dataset is
seeded, so a fresh run reproduces them exactly. **Do not re-type these numbers
from memory — read them off the screen during rehearsal and confirm they match.**

---

## Before you record

```bash
npm install
rm -rf .data          # open on the empty state, no run history on screen
npm run build && npm start
```

Open `http://localhost:3000`. Do one full rehearsal run, then `rm -rf .data`
again and restart so the dashboard opens clean.

**Browser:** full screen, 1920×1080, zoom 100%. Hide bookmarks and any
extension icons. Use a fresh profile if your toolbar is cluttered.

---

## The voiceover script

**Total: 222 words.** At 150 words/minute this lands at **~89 seconds**.

Paste each block into your TTS tool separately so the timings stay aligned with
the shot list. Suggested voice: neutral, mid-pace, professional — not
newsreader-dramatic. Add a ~0.4s pause between blocks.

---

**BLOCK 1 — 0:00–0:13**

> Most financial software asks how to earn more. The Office of the CFO's real
> lever is different. It's reallocation — moving capital already on the balance
> sheet to where it earns more next cycle.

**BLOCK 2 — 0:13–0:25**

> This is Meridian Instruments, an eleven point four five million dollar
> industrial distributor. Six hundred twenty-four ledger rows. The spreadsheet
> connector is live. Anything we haven't built says "not connected" rather than
> faking it.

**BLOCK 3 — 0:25–0:50**

> Four agents dispatch concurrently. Cash conversion cycle, eight point three
> days. Six hundred and three thousand dollars of capital trapped inside it.
> Northwind pays in sixty-seven days on thirty-day terms. We pay Kestrel in
> sixteen, when comparable vendors wait forty-four. And every number opens onto
> the rows it came from — that forty-four day benchmark is the median of the
> real logistics vendors in this ledger, not a constant in the code.

**BLOCK 4 — 0:50–1:10**

> The proposal: release six hundred and three thousand from the cash cycle and
> redeploy it into sales capacity, for seventy-three thousand of next-cycle
> payoff. It states what you give up, not just what you gain. The reasoning is
> numbered, and step one admits that only one of three analysis agents returned
> live results.

**BLOCK 5 — 1:10–1:24**

> The CFO is not a rubber stamp. Amounts are editable. Any move can be dropped.
> Approve with modifications, and the correction is recorded against the
> original proposal. The system proposes. It never executes.

**BLOCK 6 — 1:24–1:30**

> Built end to end with AO — parallel worker sessions against one shared type
> contract.

---

## Shot list and timestamps

| Time | On screen | Action |
|---|---|---|
| **0:00–0:13** | Dashboard, empty state — "No analysis run yet" | Hold still. Do not click. Let the title and empty state read. |
| **0:13–0:19** | Connections page | Click **Connections** at 0:13. Let the source cards render. |
| **0:19–0:25** | Connections page, cursor on Plaid card | Rest the cursor on **Bank feed (Plaid)** showing *Not connected*. Do not click it. |
| **0:25–0:30** | Dashboard | Navigate back at 0:24. Click **Run analysis** at ~0:26. Results appear immediately — see the note below. |
| **0:30–0:37** | Metrics strip | Slow cursor across **Days sales outstanding 39.4**, **Days payable outstanding 31.0**, **Cash conversion cycle 8.3**, **Redeployable capital $603,470**. |
| **0:37–0:43** | Cash agent panel, ranked levers | Scroll so all five levers are visible. Pause on Northwind ($256,488) and Kestrel ($110,711). |
| **0:43–0:50** | Evidence drawer | Click the evidence link on the **Kestrel Freight** lever at ~0:43. Let the source rows render and hold. Close at ~0:49. |
| **0:50–0:57** | Synthesis headline | Scroll to the proposal. Hold on the headline. |
| **0:57–1:03** | Trade-off, two columns | Cursor between the **give** and **get** columns so both read as a pair. |
| **1:03–1:10** | Numbered reasoning chain | Scroll slowly. Pause on **step 1** — the coverage-gap admission. |
| **1:10–1:16** | Moves list | Edit the first move's amount down. Click **Remove** on one move. |
| **1:16–1:24** | Approve button → post-approval position | Button now reads **Approve with modifications**. Click it at ~1:18. Hold on capital committed / uncommitted / delta. |
| **1:24–1:30** | AO desktop sidebar, then terminal | Show the named worker sessions, then `ao session ls --project capital-gambit`. |

---

## Two things that will bite you on camera

**1. The run finishes in about 20 milliseconds.** Measured, not estimated. There
is no window in which to watch the four panels resolve one by one — the results
are simply there on the next frame. Block 3 says "dispatch concurrently" over
the *filled* metrics strip, which is accurate. Do not linger waiting for an
animation, and do not add artificial delay to manufacture one.

**2. Two agents report `skipped`.** Cost and revenue are not implemented and are
labelled not-live on screen. Block 4 states this out loud, and synthesis step 1
states it in the product. Say it plainly — a judge who spots an unexplained
skipped agent will trust the rest less.

---

## If you overrun

The script has no slack. Cut in this order:

1. The Plaid card beat (0:19–0:25) — saves 6s
2. The reasoning-chain scroll (1:03–1:10) — saves 7s, shorten Block 4 to end at
   "not just what you gain"

**Never cut:** the evidence drill-down, the trade-off, or the approval step.
Those are the three things that distinguish this from a dashboard.
