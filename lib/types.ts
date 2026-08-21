/** The 14 campaign-fact fields, in the order they render in the form. */
export const FACT_FIELDS = [
  "campaign_name",
  "type",
  "effective_date",
  "action_deadline",
  "measurement_window",
  "module_duration",
  "module_location",
  "tier_1_threshold",
  "tier_2_threshold",
  "tier_3_threshold",
  "incentive",
  "cta_url",
  "utm_campaign",
  "segment",
  "unchanged_items",
] as const;

export type FactField = (typeof FACT_FIELDS)[number];

/** `type` is nullable — extract.md returns null when the intake never says. */
export const CAMPAIGN_TYPES = ["routine", "policy change"] as const;

export type CampaignFacts = Record<FactField, string | null>;

/* ---------- conform.md output ---------- */

export type Change = {
  id: string;
  rule_id: string;
  location: string;
  original: string;
  revised: string;
  reason: string;
  confidence: number;
  needs_review: boolean;
};

export type Unresolved = {
  rule_id: string;
  issue: string;
  why_blocked: string;
};

export type ConformResult = {
  campaign_id: string;
  subject_line: { text: string; char_count: number };
  preview_text: { text: string; char_count: number };
  conformed_body: { text: string; word_count: number };
  footer: { text: string };
  cta: { text: string; url: string };
  changes: Change[];
  unresolved: Unresolved[];
  summary: {
    changes_count: number;
    low_confidence_count: number;
    needs_review: boolean;
  };
};

/* ---------- grade.md output ---------- */

export type Verdict = "pass" | "fail" | "not_applicable";
export type FactVerdict = "match" | "mismatch" | "unverifiable";

export type RuleResult = {
  rule_id: string;
  verdict: Verdict;
  evidence: string | null;
  location: string | null;
  note?: string | null;
};

export type FactCheck = {
  field: string;
  stated_in_email: string | null;
  campaign_facts_value: string | null;
  verdict: FactVerdict;
  location: string;
};

/** Appendix items are detected and reported, never scored. */
export type AppendixFinding = {
  appendix: string;
  item: string;
  evidence: string;
  location: string;
};

export type GradeResult = {
  results: RuleResult[];
  fact_checks: FactCheck[];
  appendix_findings: AppendixFinding[];
  summary: {
    rules_evaluated: number;
    passed: number;
    failed: number;
    not_applicable: number;
    facts_checked: number;
    facts_mismatched: number;
    overall: "pass" | "fail";
  };
};

export type RunResponse = {
  /**
   * "conform" — a draft was supplied and rewritten.
   * "generate" — no draft; written from the campaign facts.
   * "grade" — the draft was graded as-is, with no writing step.
   */
  mode: "conform" | "generate" | "grade";
  /** Absent in grade mode: nothing was written, so there is no change log. */
  conform?: ConformResult;
  emailText: string;
  /** null while the grade request is still in flight, or if it failed. */
  grade: GradeResult | null;
  /** rule_id -> rule text, resolved from the spec on the server. */
  ruleText: Record<string, string>;
  timings: { conformMs?: number; gradeMs: number };
};

export const EMPTY_FACTS: CampaignFacts = Object.fromEntries(
  FACT_FIELDS.map((f) => [f, null]),
) as CampaignFacts;

/** `tier_1_threshold` → "Tier 1 threshold"; `cta_url` → "CTA URL". */
const ACRONYMS: Record<string, string> = { cta: "CTA", url: "URL", utm: "UTM" };

export function fieldLabel(field: string): string {
  const words = field.split("_").map((w) => ACRONYMS[w] ?? w);
  const joined = words.join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
