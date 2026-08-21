# Prompt changelog

Four runtime prompts: `extract`, `conform`, `generate`, `grade`. Scored
against `eval/gold-set.json` via `scripts/score-gold-set.mjs`, which grades
drafts as written — see the harness entry for why grading the pipeline's own
output cannot be scored against the gold set.


---

## conform v1 (Wed 19 Aug)

First honest attempt. Single prompt, no campaign facts input.

**Gold set:** 18 of 23 violations caught on `case-01-agency`.

**Misses:** S-07, V-03, T-07, F-07, A-02.

**The real problem was not the score.** With no campaign facts supplied,
the model invented a 15-minute module duration, a trailing-90-day
measurement window, a full CTA URL, and four stakeholder names that
appear nowhere in the source. It flagged all of them in `unresolved` at
low confidence, and wrote the guesses into `conformed_body` anyway.

Also added percent symbols to Tier thresholds, which are index scores.

---

## conform v2 (Wed 19 Aug)

**Changed:** added a closing sweep instruction to check every rule ID in
the spec once.

**Gold set:** 20 of 23. Recovered S-07, T-07, A-02.

**Discovered mid-run that the spec input was corrupted.** A find-and-
replace had mangled the acronym table and the domain rule, so the model
was citing rules that no longer existed. Fabrication continued: still
guessed 15 minutes, and invented four requester names.

Lesson worth keeping: the model was fine, the input was broken, and the
output looked plausible enough that it took two runs to notice.

---

## conform v3 (Wed 19 Aug)

**Changed:**
- Repasted the corrected spec
- Added: never write a value into body copy that is not present in the
  source or campaign facts. Emit a bracketed placeholder and log it in
  `unresolved`
- Added: do not introduce units, symbols, or formatting not present in
  the source

**Gold set:** 19 of 23. Slight drop from bundling multiple rule IDs into
single change objects, not from missed violations.

**Fabrication stopped.** Output now reads
`[Module duration not provided in source.]` where it previously invented
a number. No invented names, no invented URL.

Notable: the fix was a constraint, not more context. Campaign facts were
still not supplied at this point.

---

## grade v1 (Wed 19 Aug)

Separate prompt, separate call. Never sees `conform.md`.

**Caught 10 real failures** on the conformed agency draft, including F-12,
a rule written the same day.

**Predicted and confirmed:** R-06 fail, R-04 fail, F-07 pass, F-12 fail.

**Two likely false positives:** L-02 and L-05, both over-extending
enumerated rules by analogy.

**Three format defects:** self-correcting verdicts ("corrected verdict:
PASS"), emitted the conformance schema instead of its own, and returned
a prose report alongside the JSON.

---

## grade v2 (Wed 19 Aug)

**Changed:**
- Restated the grader schema explicitly, JSON only, no prose report
- Added: the verdict field contains only the final verdict, never
  revision language
- Added: when a rule enumerates specific items, apply it only to those
  items. Do not extend by analogy
- Added: a rule requiring a fact to be present is satisfied by presence
  alone. Correctness is judged in `fact_checks`
- Added `campaign_facts` as a third input and a `fact_checks` output
  block, separate from `results`

**The failure this fixed:** ran last quarter's send through conformance,
then graded the result. 57 rules evaluated, 53 passed.

- R-04 passed. Measurement window stated. That window ended five months ago
- R-06 passed. Module duration stated. It says 15 minutes, it is 20
- R-03 passed. Effective date bolded in the first paragraph. The date is
  1 July, it should be 1 October
- F-12 passed. Correctly confirmed the thresholds carried no percent
  symbol, on numbers wrong by two full points

Style conformance and factual currency are different problems. A grader
holding only the voice spec cannot see staleness.

**After the fix:** 8 fact mismatches on the same email.

---

## extract v1 (Wed 19 Aug)

**Gold set:** `extraction_case` against `02-intake-request.md`.

**Pass condition:** 12 of 14 fields return null. Any non-null date,
threshold, or duration is a fabrication and a failure.

Same no-fabrication constraint as `conform.md`, applied at the input
boundary instead of the output.

---

## extract v2 (Wed 19 Aug)

**Changed:** added a "a stated value is not automatically the field's value"
block, an internal-logistics exclusion, and a one-line definition of what each
of the 14 fields actually asks for. The schema named the fields but never
defined them, so the model matched surface strings to field names.

**Gold set:** `extraction_case` against `drafts/intake.md`. 13 of 14 null,
zero fabrications, stable across four consecutive runs.

**v1 on the same input scored 11 of 14** and produced two fabrications, both
sourced from real text in Dana's message:

- `action_deadline: "Friday"` — from "Can we get it out by Friday?" That is
  the send date. The field asks when the *Partner* must act.
- `module_location: "Academy"` — from "everyone has to do the Academy module."
  Adjectival. It names which module, not where it is hosted. The spec has no
  Academy; the module lives in the Partner Learning Center.

**Worth keeping:** this is a different failure from v1's. v1 invented values
that appeared nowhere. This one quotes the source correctly and still fills
the wrong field. It survives a "did the model make this up" review, because it
did not — and it fails downstream identically, since `conform.md` and
`grade.md` both treat campaign facts as authoritative.

The fix was definitions, not more constraints. Four of the eight existing
extraction rules already forbade guessing, and none of them applied: the model
was not guessing.

---

## conform v4 / grade v3 (Wed 19 Aug) — efficiency pass

**Problem:** a single conform call ran 17 minutes and still died on
`stop_reason: max_tokens` at a 64k ceiling. Same failure at 32k. Two gold set
cases, case-01 and case-02, both failed this way before producing any output.

**Changed, in order of effect:**

- **Effort lowered from the default `high` to `low`** on all three calls.
  These are checklist tasks against an explicit 60-rule list, not open-ended
  reasoning. Thinking draws on the same token budget as the JSON, and at
  `high` it consumed the budget before the answer was written.
- **Rule text is no longer echoed back.** Both prompts previously required
  `rule_text` "quoted from the spec" on every entry. `grade.md` returns a
  verdict for all 60 rules, so that was 60 quoted rules per run, purely
  redundant — the rule ID already identifies the rule. It is now resolved
  from the spec by ID in `lib/rules.ts`, which also removes any chance of the
  quoted copy drifting from the spec.
- **Passes are one line.** `{"rule_id", "verdict": "pass"}` with nulls
  elsewhere. Output is now spent on fails and not_applicables.

**Deliberately not changed:** conform's closing instruction to sweep every
rule ID once. That is what recovered S-07, T-07, and A-02 in v2. It is the
most expensive instruction in the prompt and it is load-bearing — cutting it
would buy speed by giving back recall.

**Since scored.** Conform completed for the first time at these settings:
`out=8724 thinking=7173 stop=end_turn`, 171s. Thinking was 82% of generated
tokens, which is the whole explanation for the earlier ceiling failures — the
rule-text and pass-line trims were real but touched only the small half.

---

## Schema and spec changes (Wed 19 Aug)

**Campaign facts gained a 15th field: `cta_url`.** The schema carried
`utm_campaign` and no destination. A-03 requires links to resolve to the
Partner Portal or a truckingpartnernetwork.com subdomain and A-04 requires
four UTM parameters, so with no URL in the facts the writer had two options,
fabricate or fail. It fabricated: `generate.md` emitted
`https://partnerportal.truckingpartnernetwork.com/spi-refresh?utm_source=[not
provided]&…`, a domain and path present nowhere in the facts.

Worth noting how the fabrication was shaped. It was not a random URL — it was
built to satisfy A-03, on the right domain, so the rule it violated is the one
it appeared to pass. Both writer prompts now name `cta_url` as the only source
for the CTA and emit an empty CTA with A-03 logged to unresolved when it is
null.

**S-05 resolved.** It read "One primary call to action per email," which does
not say whether a CTA is mandatory or capped at one. Every other Section 5
rule is conditional on a link existing. Now: at most one, never more, not
required, and Section 5 applies only where a link exists. Without this the
grader had to guess, and a guessing grader guesses differently across runs.

**Grader hole: placeholders passed.** `grade.md` held that "a rule requiring a
fact to be present is satisfied by presence alone." A bracketed placeholder is
present, so an email whose CTA read `utm_source=[not provided]` graded 60/60,
`overall: pass`. Fixed twice over: a rule that placeholder text fails the rule
it stands in for, and a deterministic backstop in `app/api/run/route.ts` that
will not report any rule the writer logged as unresolved as passing. The
backstop does not depend on the grader noticing the brackets.

---

## generate v1 (Wed 19 Aug)

**Why:** requesters who have not written anything still expect a draft. The
tool required a source draft, and `conform.md` explicitly refuses to write
one — "Conform the existing draft, do not recreate from scratch."

**Written to return the same schema as `conform.md`**, so the serializer, the
grader, and the results view needed no special-casing. `changes` is always
empty: nothing was changed, because nothing was given to change. The audit
trail for a generated email is `unresolved`.

**Gold set:** none. There is no case for generation from facts.

**Measured on `drafts/intake.md`** (extraction returns 13 of 15 null, so this
is close to the worst case): 9 bracketed placeholders in the copy, 8
unresolved rules, `needs_review` true, 48s. An email written from an almost
empty fact set should look visibly unfinished rather than smoothly plausible,
and it does.

**One real failure, found on the first run.** It invented a CTA URL:
`https://partnerportal.truckingpartnernetwork.com/spi-refresh`, a domain and
path present nowhere in the facts, in direct violation of the prompt's own
first rule. Note the shape of it — the URL was built to satisfy A-03, sitting
on the right domain, so the rule it broke is the one it appeared to pass.
Fixed by naming `cta_url` as the CTA's only source and requiring an empty CTA
with A-03 logged when it is null.

---

## grade v4 (Wed 19 Aug) — appendices detected, not graded

**Problem:** Appendix A is banned phrases, and "any occurrence fails
conformance." But it is not a numbered rule and has no ID, so the grader had
nothing to return. `case-01` expected `rule_id: "APPENDIX-A"`, which the
grader could only have produced by inventing an ID. It was an automatic miss.

**Changed:** a separate `appendix_findings` block, and explicit instructions
not to add appendix items to `results`, not to invent an APPENDIX-A rule ID,
and not to let a banned phrase change any numbered rule verdict or the
overall verdict. Matching is on the phrase, not on meaning.

**Gold set, case-01:** 15 occurrences found, covering every distinct phrase in
the gold set's evidence list. Extras on the numbered rules dropped from 7 to
4 — the grader had been straining to map appendix items onto rule IDs.

**Denominators changed.** case-01 is 22 numbered violations, not 23. Earlier
scores counting APPENDIX-A against the rule tally were measuring something
the grader could not do.

---

## Harness: grade-only path and split requests (Wed 19 Aug)

**The gold set could not be scored at all.** Every case labels violations in
the *source draft*, but conform-then-grade only ever grades its own output,
by which point those violations are fixed. Scoring the pipeline against
`expected_violations` returns near-zero by construction — not because
detection failed, but because the two measure different things. On `case-02`
the pipeline caught all 8 stale facts and the grade correctly reported 0
mismatches, because nothing stale survived into the graded email.

**`POST /api/grade`** grades an email as written, one call, no rewriting.
`scripts/score-gold-set.mjs` runs the set against it.

**First full score, all four cases:**

```
case-01-agency    21/23   166s   missed APPENDIX-A, T-07
case-02-recycled   5/6    127s   missed L-06,  facts 7/8
case-03-sme       13/18   182s   missed A-04, S-01, S-04, S-05, S-06
case-04-bullets    4/6     90s   missed S-04, V-03
                  43/53
```

Read those with two corrections. `case-04` is scored inversely — passing
means declining to process fragments — so grading it against rule IDs
measures the wrong thing entirely and that row is noise. And `case-02` has
run 6/6, 5/6, and 5/6 on identical input, so treat single-run deltas under
two as noise.

**`L-02` and `L-05` keep appearing as extras**, which is the same
over-extension by analogy that grade v1 flagged. The don't-extend-by-analogy
instruction added in v2 is not holding for them.

**`utm_campaign` is probably a gold set defect, not a miss.**
`drafts/recycled-q2.md` carries no URL at all, so there is no stale
`tpn-spi-q2-refresh` in the draft to flag. The gold set expects one.

**Conform and grade were also split into separate requests.** Not for speed —
neither call got faster — but because a 4-minute write and a 2-minute grade
in one handler fit no serverless ceiling, and a grade that fails threw away a
write that had succeeded. The email now renders as soon as it exists, and a
failed grade leaves it on screen with a retry. The unresolved-rule backstop
moved into `/api/grade` so it survives the split.

---

## Latency: what did not work (Wed 19 Aug)

**Target was under three minutes. Generate meets it (~110s). Conform does
not, and cannot be made to.**

Latency is near-linear in tokens generated, about 51 tokens/sec, and thinking
is 71-82% of them. The same conform input has run 171s, 265s, and 319s.

**`budget_tokens` does not work on Sonnet 4.6.** It is deprecated there, and
the API accepts it and ignores it. A grade call given `budget_tokens: 2000`
reported `thinking=12588/2000` and ran 244s, against 127-148s for the same
call with adaptive thinking. It was strictly worse: no cap, and adaptive
reasoning given up for nothing. Reverted.

**So there is no hard ceiling available on this model.** The remaining
choices are adaptive thinking (unbounded, best quality), thinking off
(enforceable, and it is 71-82% of the model's work), or architecture. The
split above is the architectural half. Parameter tuning is exhausted — worth
recording so it is not attempted again.

---

## Spec gaps found while building

Patched into `spec/tpn-email-standards.md` before the build.

- **F-12.** Tier designations use numerals and are index scores, never
  percentages. Without it the model added percent symbols and the grader
  had no basis to object.
- **T-10.** Subject line and preview text are exempt from first-use
  acronym expansion. S-01 caps the subject at 50 characters, which makes
  expansion there impossible.
- **R-07.** The Appendix B footer is exempt from Section 2 terminology
  rules. R-02 requires the footer, the footer contains an acronym, and
  T-04 requires expanding it. Every email would otherwise fail on account
  of its own mandatory footer.
- **Open:** the spec does not say whether calendar quarter shorthand (Q1,
  Q2) counts as an acronym subject to T-04. Surfaced by the grader, not
  by me. Left unresolved and flagged.
