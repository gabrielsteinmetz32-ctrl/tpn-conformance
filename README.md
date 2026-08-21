# Email conformance engine

An AI tool that takes campaign copy from any source and conforms it to a
program's voice and rules, then grades the result against the same spec.

**Live tool:** https://tpn-marketing-project.vercel.app
**Walkthrough video:** https://youtu.be/dmZmLv0PO4o

The program is the Trucking Partner Network, a fictional logistics partner
program. All data is synthetic.

## How it runs

Three sequential Claude calls, each its own API route, each with a JSON
schema enforced at the API layer:

1. **Extract** — pulls 14 campaign facts from an intake message, returning
   `null` for anything the message does not state outright. It never guesses.
2. **Conform** (or **Generate**) — rewrites the source draft against the spec,
   with an auditable change log: every edit carries its rule ID, the original
   text, the revision, and a confidence score.
3. **Grade** — a separate call that scores the finished email against all
   ~60 spec rules, plus a fact check against the extracted facts.

Grading is deliberately a separate request from writing. The grader never
sees the change log, so it cannot be talked into agreeing with the writer.

## Prompts

- `prompts/extract.md` — pulls campaign facts from an intake message
- `prompts/conform.md` — conforms an existing draft
- `prompts/generate.md` — writes from facts alone, when there is no draft
- `prompts/grade.md` — grades the finished email, separately from the write

Prompts and the spec are read from disk at request time, never inlined as
constants — editing a `.md` file changes behavior without a rebuild.

## Evaluation

- `eval/gold-set.json` — hand-written answer key: four cases, 53 labeled
  violations across them
- `scripts/score-gold-set.mjs` — runs the set and prints per-case scores
- `PROMPTS.md` — every prompt version, what changed, and what it scored

Latest full run: **43 of 53**, with the caveats recorded in `PROMPTS.md` —
`case-04` is scored inversely and that row measures the wrong thing, and
`case-02` varies by one on identical input.

`PROMPTS.md` also records what did not work: `budget_tokens` is deprecated
on Sonnet 4.6 and silently ignored, so latency is not tunable by parameter
on this model. That was solved by splitting conform and grade into separate
requests instead.

## Inputs

- `spec/tpn-email-standards.md` — the voice and requirements doc
- `drafts/intake.md` — the campaign request
- `drafts/agency.md`, `drafts/sme-notes.md`, `drafts/bullets.md`,
  `drafts/recycled-q2.md` — four source drafts, deliberately unalike:
  polished agency copy, a raw SME brain dump, bullet fragments, and last
  quarter's send

## Running it locally

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

See `RUNNING.md` for the workflow in order.
