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

**Total: 219 words.** At 150 words/minute that is **~88 seconds** of speech;
with a short pause between blocks it lands just under **1:30**.

Paste each block into your TTS tool separately so the timings stay aligned with
the shot list. Suggested voice: neutral, mid-pace, professional — not
newsreader-dramatic. Keep pauses between blocks to ~0.4s; the script has no
slack for longer ones.

---

**BLOCK 1 — 0:00–0:13** *(31 words)*

> Most financial software asks how to earn more. The Office of the CFO's real
> lever is reallocation — moving capital already on the balance sheet to where
> it earns more next cycle.

**BLOCK 2 — 0:13–0:26** *(32 words)*

> This is Meridian Instruments, an eleven and a half million dollar
> distributor. Six hundred twenty-four ledger rows. The spreadsheet connector is
> live. Anything we haven't built says so, rather than faking it.

**BLOCK 3 — 0:26–0:51** *(59 words)*

> Four agents dispatch concurrently. Cash conversion cycle, eight point three
> days. Six hundred three thousand dollars trapped. Northwind pays in
> sixty-seven days on thirty-day terms. We pay Kestrel in sixteen, when
> comparable vendors wait forty-four. Every number opens onto its source rows —
> that benchmark is the median of this ledger's logistics vendors, not a
> constant in the code.

**BLOCK 4 — 0:51–1:11** *(50 words)*

> The proposal: release six hundred and three thousand from the cash cycle and
> redeploy it into sales capacity, for seventy-three thousand next cycle. It
> states what you give up, not just what you gain. Reasoning is numbered, and
> step one admits only one of three analysis agents returned live results.

**BLOCK 5 — 1:11–1:24** *(31 words)*

> The CFO is not a rubber stamp. Amounts are editable. Moves can be dropped.
> Approve with modifications, and the correction is recorded against the
> proposal. The system proposes. It never executes.

**BLOCK 6 — 1:24–1:30** *(14 words)*

> Built end to end with AO — parallel worker sessions against one shared type
> contract.

---

## Shot list and timestamps

| Time | On screen | Action |
|---|---|---|
| **0:00–0:13** | Dashboard, empty state — "No analysis run yet" | Hold still. Do not click. Let the title and empty state read. |
| **0:13–0:20** | Connections page | Click **Connections** at 0:13. Let the source cards render. |
| **0:20–0:26** | Connections page, cursor on Plaid card | Rest the cursor on **Bank feed (Plaid)** showing *Not connected*. Do not click it. |
| **0:26–0:31** | Dashboard | Navigate back at 0:25. Click **Run analysis** at ~0:27. Results appear immediately — see the note below. |
| **0:31–0:38** | Metrics strip | Slow cursor across **Days sales outstanding 39.4**, **Days payable outstanding 31.0**, **Cash conversion cycle 8.3**, **Redeployable capital $603,470**. |
| **0:38–0:44** | Cash agent panel, ranked levers | Scroll so all five levers are visible. Pause on Northwind ($256,488) and Kestrel ($110,711). |
| **0:44–0:51** | Evidence drawer | Click the evidence link on the **Kestrel Freight** lever at ~0:44. Let the source rows render and hold. Close at ~0:50. |
| **0:51–0:58** | Synthesis headline | Scroll to the proposal. Hold on the headline. |
| **0:58–1:04** | Trade-off, two columns | Cursor between the **give** and **get** columns so both read as a pair. |
| **1:04–1:11** | Numbered reasoning chain | Scroll slowly. Pause on **step 1** — the coverage-gap admission. |
| **1:11–1:17** | Moves list | Edit the first move's amount down. Click **Remove** on one move. |
| **1:17–1:24** | Approve button → post-approval position | Button now reads **Approve with modifications**. Click it at ~1:19. Hold on capital committed / uncommitted / delta. |
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
