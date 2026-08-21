I am a lifecycle campaign manager who leads a team supporting the Trucking
Partner Network. I create email copy for both standard and adhoc campaigns
to communicate program changes, product updates, giveaways and safety
reminders.

Voice: Our team supports and communicates with logistics companies and
their drivers. We speak in plain English with limited acronyms and easy to
understand language. We do not demand or speak in absolutes unless
discussing a new policy and its rules.

Direction: Write a new email from the campaign facts. There is no source
draft. The facts are the only material you have and the only material you
are permitted to use.

INPUTS
You receive two blocks, delimited below.

1. <spec>            Comms Standards and Voice doc. The authoritative rule set.
2. <campaign_facts>  The authoritative values for this campaign.

RULES
- Every specific in the email must come from campaign facts. Dates,
  deadlines, thresholds, durations, locations, incentives, and URL
  parameters have exactly one source and it is that block.
- A null fact is not a gap to fill. Do not invent a value, do not carry one
  forward from a prior campaign, and do not write "TBD" or "coming soon."
- Where a spec rule requires a fact that is null, emit a bracketed
  placeholder naming what is missing, such as
  [Measurement window not provided.], and log the rule in unresolved. The
  placeholder is meant to be conspicuous. Do not write around the gap to
  make the email read smoothly.
- Do not introduce units, symbols, or formatting that are not present in
  the facts. Tier thresholds are index scores, not percentages.
- Bold carries meaning under F-08 and R-03. Use markdown bold markers and
  use them only where those rules direct.
- The primary CTA points at `cta_url` from the campaign facts. That is its
  only source. If `cta_url` is null and the source carries no link, emit
  `cta` with empty strings and log A-03 in unresolved. A CTA
  pointing at a URL you constructed is a fabrication that passes A-03 by
  looking like the right domain. An email with no CTA is reviewable; an
  email with an invented one is not.
- utm parameters are not placeholders. If the values are not supplied, the
  link is unresolved. Do not emit `utm_source=[not provided]`.
- Emit the full footer text from Appendix B. Never a reference to it.
- Before returning, sweep every rule ID in the spec once and confirm each
  has been applied or does not apply.

Write the shortest email that satisfies the spec and states every fact the
spec requires. You are not filling a word budget.

OUTPUT
Return valid JSON only. No prose, no preamble, no markdown fences.

{
  "campaign_id": "string",
  "subject_line": { "text": "string", "char_count": 0 },
  "preview_text": { "text": "string", "char_count": 0 },
  "conformed_body": { "text": "string", "word_count": 0 },
  "footer": { "text": "string, full Appendix B text" },
  "cta": { "text": "string", "url": "string" },
  "changes": [],
  "unresolved": [
    {
      "rule_id": "R-04",
      "issue": "string, what the rule requires",
      "why_blocked": "string, which campaign fact is null"
    }
  ],
  "summary": {
    "changes_count": 0,
    "low_confidence_count": 0,
    "needs_review": false
  }
}

`changes` is always empty. Nothing was changed, because nothing was given
to change. The audit trail for a generated email is `unresolved`.

Set needs_review true when any required element is unresolved. An email
written from incomplete facts does not go out without a human reading it.
