# The stage-by-stage playbook — what you do, and what to say to the model

> Who this is for: developers who can code but are new to working with a Fable 5-class model.
> Each stage has a collapsible "⚙ Advanced" section for people already fluent in Claude Code; the main line never depends on it.
> 繁體中文版:[workflow.zh-TW.md](workflow.zh-TW.md)
>
> The premise: **the model's capability is no longer the bottleneck. Your bottleneck is knowing what to do now, and what to say.**
> You own the steering wheel (what to build, what counts as done, whether it's worth continuing); the model does the driving
> (how to build it, doing it, verifying it). This playbook is the steering wheel's manual. The formal definition of every
> obligation lives in the README's [trigger-obligation table](../README.md#core-principle-records-follow-work--they-dont-lead-it) — not re-copied here.

## The one-page map

| Stage | You do | You say |
|---|---|---|
| 0. First install | Do nothing — let the model write the first STATE | "initialize STATE with /fw-record" |
| 1. Opening / taking over | **Nothing.** Listen to the status report first | `/fw-coldstart` |
| 2. Deciding what to build | Say **what** you want, never how | "Don't touch the code yet — give me 2-3 approaches and the trade-offs" |
| 3. While it works | Hands off; answer only when asked to decide | (Interrupt only when the direction is wrong: "stop, because…") |
| 4. Acceptance | Trust evidence, never verbal reports | "Run the tests and typecheck; paste the output" |
| 5. Wrap up or stop | Decide: "done" or "continuing later" | "wrap up" (record) / "handoff" |
| 6. Something's wrong | Fix health first; no new work on top | "Handle the yellow items before anything else" |

---

## 1. Opening / taking over: restore state before discussing work

The first thing you type in every session, always:

```
/fw-coldstart
```

The model reads `STATE.md` and the latest flight record, then reports three things: where the last session got to, where this one plans to pick up, and whether any changes are unverified. **Don't assign work until the report is done** — the minute you wait buys you a model that isn't working from a wrong picture.

Your only job at this stage: check the health color in the report. Green — wave it through. Yellow or red — have the model clean up first (see stage 6).

<details>
<summary>⚙ Advanced</summary>

- Cold start is the framework's single quality metric: if a fresh session needs more than 5 minutes to take over safely, your records are degrading and it's time to compact. The prescription is one sentence: "this cold start took X minutes — diagnose what's slow and compact." The model returns with a diagnosis and an item-by-item plan (which entries to mark superseded, which to merge); you approve with one word. Facts over pressure: "over 5 minutes means the next session fumbles the takeover" works; "this is serious!" doesn't.
- The lag is measurable: `git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD` — ≥1 means the last session never wrapped up.
- With the [status line](../README.md#status-line-optional) installed, lag and context usage sit at the bottom of the screen, with the next command suggested.
</details>

## 2. Deciding what to build: say what, not how

This is your highest-value sentence of the session. Make three things clear: **what you want, why you want it, what counts as done.** Don't specify the implementation — that's the model's job, and the tighter you specify it, the more likely you lock it into a mediocre solution.

When you're not sure the approach is settled, ask for options before releasing the brake:

```
I want users to be able to export reports as CSV. Don't touch the code yet —
give me 2-3 approaches with trade-offs, and recommend one.
```

Small things (copy tweaks, typo fixes, adding a log line) don't need the ceremony — just say "do X". The test: **would a wrong first attempt hurt?** If yes, ask for approaches first; if no, just let it run.

<details>
<summary>⚙ Advanced</summary>

- Choosing an approach closes the others — that's exactly what DECISIONS is for, and the model appends the line (with the why) itself. Your only job: check the recorded *why* is your real reason, not a plausible reconstruction.
- Claude Code's plan mode (full plan first, you approve, then it executes) exists for big changes. flightwake's default is the opposite: **everything starts immediately; only multi-session construction escalates to a phase** (the escalation rule in the README). Don't ritualize everything.
- When you can't articulate the requirement, flip it: "Restate the requirement and acceptance criteria as you understand them; I'll confirm before you start."
</details>

## 3. While it works: hands off, veto rights on

Once the model is moving, your discipline is **don't interrupt**. Asking "how's it going" mid-run buys you nothing but a broken stride. It will stop and ask when it hits a decision that's yours; if it didn't ask, let it finish.

The only two reasons to step in:

- **The direction is wrong**: interrupt with a reason — "stop: this approach touches the prod schema, and I don't want that." A reasoned stop becomes a DECISIONS line; an unreasoned stop is just noise.
- **It's clearly going in circles**: same error, three approaches, none landed — say "stop; summarize the symptom and what you've tried." A human glance often cracks it instantly.

When it hits a non-obvious trap mid-run (lying error messages, vendor quirks, encoding gotchas), the model files a `/fw-trap` on its own. Glance at it and move on — it's written for the next session, not for you.

<details>
<summary>⚙ Advanced</summary>

- Hands-off works because the hard guards are in place: tests green + typecheck clean before "done" counts, destructive operations confirmed first — installed into the instruction file on day one, independent of model self-discipline.
- The TRAPS bar is "**non-obvious**": anything documented doesn't qualify; what you want is "the symptom misleads about the root cause." Over-filing dilutes the registry — >20 active entries means it's time to compact.
- Independent tasks: say "these three don't depend on each other — run them in parallel."
</details>

## 4. Acceptance: evidence only

When the model says "done", what you want isn't agreement — it's evidence:

```
Run the tests and typecheck, paste the output. Then give me a diff summary
and flag the riskiest spot yourself.
```

There is no shortcut around looking at the diff. You don't have to read every line — but you check **which files it touched**. Anything outside what you expected is the finding.

<details>
<summary>⚙ Advanced</summary>

- Changes that touch prod must leave verification evidence in the flight record (command output, reconciliation numbers). That's a hard guard, not a courtesy.
- Green tests don't mean the feature works: "/verify — actually drive the affected flow" gets closer to the truth than the suite does.
- Want harder gates? "/code-review" puts a second pair of eyes on the diff. On the CI side, [state-check](../README.md#ci-side-wrap-up-check-optional) turns "did you wrap up?" into a machine-enforced door.
</details>

## 5. Wrap up or stop: two exits, don't take the wrong one

When a session is ending, there's exactly one question: **is this piece of work done?**

- **Done** → say "**wrap up**". The model runs `/fw-record`: flight record, STATE update, sensitive-info self-check.
- **Not done, continuing later** → say "**handoff**". The model runs `/fw-handoff`, writing where it got to, where it's stuck, and where the next session enters — the CONTEXT.

The classic mistake is doing neither and closing the window. There's a net for forgetting: when STATE lags ≥3 commits, the Stop hook blocks once before the session ends. But treating the net as routine is a bad habit — **the net is for forgetting, not for skipping**.

<details>
<summary>⚙ Advanced</summary>

- Records aren't only for session-end: touched schema, touched prod, or ≥3 commits since the last record — any one of these means wrap up now.
- A handoff is written **before stopping, not before starting** — the root difference between flightwake and stage-driven frameworks: the plan is a road sign left after contact with reality, not a gate before it.
- Commit right after the record — state only truly exists once it's in git, where other agents and teammates can see it.
</details>

## 6. Something's wrong: stop the bleeding first

When the cold-start report says health is yellow or red, there's one rule: **no new work on top.**

```
Deal with the yellow/red items in STATE first — verify what needs verifying,
roll back what needs rolling back. We'll talk new features when it's green.
```

The other common case: STATE is stale (>7 days) while git log shows fresh commits — someone (or some session) broke discipline in between. Have the model backfill a record first ("archaeology is cheapest while the memory is still in the commit messages"), then start.

<details>
<summary>⚙ Advanced</summary>

- Health semantics: green = safe to build on; yellow = unverified changes exist; red = known broken. An honest color beats a pretty one — dashboards lie to their owners last.
- Taking over a repo that never had flightwake? Install, then excavate: `npx flightwake init`, then "archaeologize this repo's current state into the first STATE with /fw-record".
</details>

---

## Command cheat sheet

```
/fw-coldstart   first thing every session — restore state
"wrap up"        → /fw-record: flight record + STATE update
"handoff"        → /fw-handoff: stopping mid-build
/fw-trap        register a non-obvious trap (usually the model's own call)
```

One last thing: in this whole flow **you memorize exactly one line** — open with `/fw-coldstart`. Every other obligation triggers itself from the instruction file; your job shifts from remembering process to making judgment calls. That's the human's seat in the strong-model era.
