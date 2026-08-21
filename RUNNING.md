# Running the conformance workflow

## One-time setup

```bash
cd ~/Projects/tpn-conformance
npm install
```

`ANTHROPIC_API_KEY` must be in `.env.local` at the repo root. It is already
there and git-ignored via `.env*`. Vercel does not read `.env.local` — set the
key separately in the Vercel dashboard before deploying.

## Start it

```bash
npm run dev
```

Open http://localhost:3000. Nothing else to start: no database, no auth, no
worker.

## The workflow, in order

**1. Extract campaign facts.** Paste the requester's intake message and press
*Extract facts*. `prompts/extract.md` returns all 14 fields, with `null` for
anything the message does not state outright.

**Blank fields are the point, not a bug.** A blank means the intake never said,
and the extractor is instructed never to guess. Fill the blanks in yourself
before running. Everything downstream treats these values as authoritative, so
a wrong value here propagates into the email and the grader will not catch it —
the grader checks the email against these facts, never the facts themselves.

**2. Paste the source draft** into section 2. Agency copy, an SME brain dump,
bullet fragments, or last quarter's send — all four are in scope.

**3. Press Run.** Two sequential Claude calls. (Or **Grade draft as-is** to
skip the writing step and grade the draft exactly as pasted — one call, and
the only mode that can be scored against the gold set.)

- `prompts/conform.md` receives `<spec>`, `<campaign_facts>`, `<draft>` and
  returns conformed copy plus a change log keyed to rule IDs.
- The result is serialized to plain text (`SUBJECT`, `PREVIEW`, `BODY`,
  `FOOTER`, `CTA TEXT`, `CTA URL`, bold markers preserved).
- `prompts/grade.md` receives `<spec>`, `<campaign_facts>`, `<email>` and
  grades that text.

The grader never sees the conformer's output schema or its reasoning. That
separation is deliberate — see `CLAUDE.md`. Do not merge the two calls.

**Target is under three minutes** for both calls. The results panel prints the
actual conform and grade timings under the counts, and the server logs
`[run] conform=…ms grade=…ms` plus per-call token usage.

If it creeps back up, the levers are in `lib/claude.ts`, in order of effect:

1. `effort` on `callClaude` (currently `"low"`). This is the dominant control.
   It was the default `"high"` originally, which blew a 64k output ceiling
   without finishing.
2. What the prompts ask the model to write. Rule text is resolved from the
   spec by ID in `lib/rules.ts` and is deliberately not echoed back; passes
   are a single line. Re-adding either is expensive at 60 rules.
3. `max_tokens` is a ceiling, not a target. Raising it does not speed anything
   up; it only avoids losing a call that overruns.

## Reading the results

Left column is the conformed email. Below it, **Unresolved** lists rules the
conformer could not satisfy because the source and the facts both lacked the
input — these are your gaps to fill, not model failures.

Right column, in priority order:

1. **Fact mismatches** — the email states something the campaign facts
   contradict. These come first because a stale threshold ships wrong even
   when every style rule passes. This is the failure mode `PROMPTS.md`
   documents for the recycled-Q2 case: 53 of 57 rules passed on an email whose
   dates were five months old.
2. **Rule failures** — rule ID, the grader's note, and the offending text
   quoted verbatim.
3. **Needs review** — changes the *conformer* flagged below 0.7 confidence.
   Read these before shipping.

Counts above them: rules passed, rules failed, fact mismatches, needs review,
with rules-evaluated and not-applicable underneath.

## If a run fails

**"hit the 64000 token output ceiling"** — the call generated more than it
could finish. Raising `max_tokens` (128k is Sonnet 4.6's maximum) is the
stopgap; lowering `effort` is usually the real fix, since thinking draws on
the same budget as the JSON.

**"credit balance is too low"** — the Anthropic account is out of credits, not
a code problem. Top up under Plans & Billing.

**"Streaming is required for operations that may take longer than 10 minutes"**
— the SDK refuses a non-streaming call whose `max_tokens` implies a long run.
`callClaude` already uses `messages.stream()`; keep it that way rather than
lowering `max_tokens` to get under the limit.

The error names which of the three calls failed.

## Evaluating against the gold set

`eval/gold-set.json` holds one campaign's facts, the target output, and four
labelled source drafts in `drafts/`. Every draft feeds the same campaign, so
they share one `target_output` and one set of `campaign_facts`.

Score every case from the command line, with the dev server running:

```bash
node scripts/score-gold-set.mjs
```

Or one case: `node scripts/score-gold-set.mjs case-02-recycled`.

It reports violations caught against expected, plus fact mismatches for cases
that label staleness. It uses **`/api/grade`, not `/api/run`** — and that
distinction is the whole reason the script exists. The gold set labels
violations in the *source draft*. Conform-then-grade only ever grades its own
output, by which point those violations are fixed, so scoring the pipeline
against `expected_violations` returns near-zero by construction. Grading the
draft as written is the only comparison that means anything.

In the UI the same thing is the **Grade draft as-is** button in section 3.

Run a case by hand instead by pasting `eval/gold-set.json`'s `campaign_facts`
into the form and the draft into section 2:

| Case | Draft | What it tests |
| --- | --- | --- |
| case-01 | `drafts/agency.md` | high-volume obvious violations, 23 expected |
| case-02 | `drafts/recycled-q2.md` | staleness — passes most style rules, 8 stale facts |
| case-03 | `drafts/sme-notes.md` | correct facts, wrong form |
| case-04 | `drafts/bullets.md` | fragments; passing means **declining** to generate |
| case-05 | `drafts/intake.md` | extraction only — passing means returning nulls |

case-02 is the one that matters most. A grader holding only the voice spec
passes it, which is the whole reason `grade.md` takes `campaign_facts` as a
separate input.

case-04 is scored inversely: the tool should route it to human drafting rather
than generate a full email from fragments. The app has no decline path today —
it will attempt a conformance pass. Treat a confident-looking output here as a
failure, not a success.

## Editing prompts and the spec

`prompts/*.md` and `spec/tpn-email-standards.md` are read from disk with
`fs.readFile` on every request. Edit them and press Run again — no rebuild, no
restart. Nothing is inlined in the TypeScript.

Adding a rule to the spec is enough for the grader to start returning a verdict
for it. Rule IDs are matched as free strings, so keep the `X-NN.` format.

## Before deploying

```bash
npm run build
npm run lint
```

`next.config.ts` traces `prompts/` and `spec/` into the serverless bundle via
`outputFileTracingIncludes`. Without that the routes throw `ENOENT` in
production, because nothing imports those files for Next to discover them.

`/api/run` declares `maxDuration = 800`. Vercel enforces its own ceiling per
plan, and the default Hobby limit is far below this. Confirm your plan allows
it, or split the two calls across separate requests before deploying.
