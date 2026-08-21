@AGENTS.md

# tpn-conformance

## What this is

An LLM pipeline that turns a team member's email-campaign request into a
reviewed, corrected campaign. Four stages:

1. **Intake** — read the requester's campaign request
2. **Generate** — build a campaign from the request, several example
   campaigns, and a requirements doc
3. **Grade** — a *separate* pass that scores the generated campaign for fit
   against the requirements. Deliberately separate from generation so the
   grader isn't anchored by the generator's reasoning.
4. **Correct + final review** — fix the issues the grader raised, then review

Stages 2 and 3 must stay independent calls. Collapsing them into one prompt
defeats the point of the grader.

> TODO(gabe): what "TPN" stands for, and what "conformance" is measured
> against. Fill this in — it determines what the grader actually checks.

## Gold set

The grader needs a gold set: request → known-good campaign pairs, plus
known-bad ones with the specific defect labeled. Without it there's no way to
tell a working grader from one that returns plausible scores. Not yet written.

## Stack

- Next.js 16.3.1, React 19.2.8, TypeScript, Tailwind, App Router, Turbopack
- `@anthropic-ai/sdk` 0.117.1
- Deploys to Vercel from `main`

## Environment

- `ANTHROPIC_API_KEY` in `.env.local` locally; set separately in the Vercel
  dashboard — Vercel does not read `.env.local`
- `.env.local` is git-ignored via `.env*` in `.gitignore`. Keep it that way.

## Constraints to design around

- **Serverless function timeouts.** Four sequential Claude calls will exceed
  Vercel's default function duration. This needs to be solved by design —
  streaming, background jobs, or splitting stages across requests — not
  discovered at deploy time.
- **Next.js 16 is newer than most models' training data.** See `AGENTS.md`:
  read `node_modules/next/dist/docs/` before writing framework code.

## Commands

```bash
npm run dev     # dev server on :3000
npm run build   # production build — run before pushing
npm run lint
```

