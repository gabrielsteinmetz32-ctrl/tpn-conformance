import Anthropic from "@anthropic-ai/sdk";
import { CAMPAIGN_TYPES, FACT_FIELDS } from "./types";

export const MODEL = "claude-sonnet-4-6";

/**
 * Per-call thinking mode.
 *
 * `budget_tokens` was tried here and does not work: it is deprecated on
 * Sonnet 4.6 and the API accepts it while ignoring it. A grade call given
 * `budget_tokens: 2000` reported `thinking=12588/2000` and ran 244s, against
 * 127-148s for the same call with adaptive thinking. There is no hard
 * ceiling available on this model — only adaptive (unbounded, best quality)
 * or off.
 *
 * Latency is near-linear in tokens generated (~51 tok/s) and thinking is
 * 71-82% of them, so runtime varies with how much the model decides to
 * think. The same conform input has run 171s and 319s. That variance is a
 * property of the model, not something these parameters can remove.
 *
 * Re-measure with `node scripts/score-gold-set.mjs` after changing anything
 * here.
 */
export const THINKING: Record<CallLabel, "adaptive" | "off"> = {
  extract: "adaptive",
  generate: "adaptive",
  conform: "adaptive",
  grade: "adaptive",
};

export type CallLabel = "extract" | "generate" | "conform" | "grade";

export const anthropic = new Anthropic();

const nullableString = { type: ["string", "null"] };

function object(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/** extract.md — 14 flat fields, every key present, absent values null. */
export const FACTS_SCHEMA = object(
  Object.fromEntries(
    FACT_FIELDS.map((field) => [
      field,
      field === "type"
        ? {
            // A nullable enum: extract.md returns null when the intake does
            // not state the campaign type. `type: [...]` alongside `enum`
            // is rejected by the API, so the union goes through anyOf.
            anyOf: [
              { type: "string", enum: [...CAMPAIGN_TYPES] },
              { type: "null" },
            ],
          }
        : nullableString,
    ]),
  ),
);

/** conform.md — conformed copy plus the auditable change log. */
export const CONFORM_SCHEMA = object({
  campaign_id: { type: "string" },
  subject_line: object({
    text: { type: "string" },
    char_count: { type: "integer" },
  }),
  preview_text: object({
    text: { type: "string" },
    char_count: { type: "integer" },
  }),
  conformed_body: object({
    text: { type: "string" },
    word_count: { type: "integer" },
  }),
  footer: object({ text: { type: "string" } }),
  cta: object({ text: { type: "string" }, url: { type: "string" } }),
  changes: {
    type: "array",
    items: object({
      id: { type: "string" },
      rule_id: { type: "string" },
      location: { type: "string" },
      original: { type: "string" },
      revised: { type: "string" },
      reason: { type: "string" },
      confidence: { type: "number" },
      needs_review: { type: "boolean" },
    }),
  },
  unresolved: {
    type: "array",
    items: object({
      rule_id: { type: "string" },
      issue: { type: "string" },
      why_blocked: { type: "string" },
    }),
  },
  summary: object({
    changes_count: { type: "integer" },
    low_confidence_count: { type: "integer" },
    needs_review: { type: "boolean" },
  }),
});

/** grade.md — one verdict per spec rule, plus separate fact checks. */
export const GRADE_SCHEMA = object({
  results: {
    type: "array",
    items: object({
      rule_id: { type: "string" },
      verdict: { type: "string", enum: ["pass", "fail", "not_applicable"] },
      evidence: nullableString,
      location: nullableString,
      note: nullableString,
    }),
  },
  fact_checks: {
    type: "array",
    items: object({
      field: { type: "string" },
      stated_in_email: nullableString,
      campaign_facts_value: nullableString,
      verdict: { type: "string", enum: ["match", "mismatch", "unverifiable"] },
      location: { type: "string" },
    }),
  },
  appendix_findings: {
    type: "array",
    items: object({
      appendix: { type: "string" },
      item: { type: "string" },
      evidence: { type: "string" },
      location: { type: "string" },
    }),
  },
  summary: object({
    rules_evaluated: { type: "integer" },
    passed: { type: "integer" },
    failed: { type: "integer" },
    not_applicable: { type: "integer" },
    facts_checked: { type: "integer" },
    facts_mismatched: { type: "integer" },
    overall: { type: "string", enum: ["pass", "fail"] },
  }),
});

/**
 * One structured-output call. The prompts each specify "valid JSON only, no
 * markdown fences" — a schema enforces that at the API layer instead of
 * relying on the instruction holding.
 *
 * Adaptive thinking is on: grading 60 rules and diffing every fact is
 * judgment work, not formatting work.
 */
export async function callClaude<T>(
  label: CallLabel,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const mode = THINKING[label];
  // Streaming, not create(): grading 60 rules can exceed the SDK's 10-minute
  // non-streaming ceiling, and the SDK rejects the request outright rather
  // than letting it time out mid-flight.
  const stream = anthropic.messages.stream({
    model: MODEL,
    // A ceiling, not a target. Rule text is no longer echoed back and passes
    // are single-line, so real output is far below this. Kept high because
    // hitting it wastes the entire call.
    max_tokens: 64000,
    thinking: mode === "off" ? { type: "disabled" } : { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
    // "low" is the floor for effort and the only working latency control.
    output_config: { effort: "low", format: { type: "json_schema", schema } },
  });

  const response = await stream.finalMessage();

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const usage = response.usage;
  const thought = usage.output_tokens_details?.thinking_tokens ?? 0;
  console.log(
    `[${label}] in=${usage.input_tokens} out=${usage.output_tokens}` +
      ` thinking=${thought}` +
      ` stop=${response.stop_reason}`,
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `The ${label} call hit the 64000 token output ceiling before ` +
        `finishing its JSON. Raise max_tokens in lib/claude.ts, or trim the ` +
        `spec so fewer rules are returned per grade.`,
    );
  }

  if (!text.trim()) {
    throw new Error(
      `The ${label} call returned no content (stop_reason: ${response.stop_reason}).`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `The ${label} call returned unparseable JSON: ${text.slice(0, 300)}`,
    );
  }
}
