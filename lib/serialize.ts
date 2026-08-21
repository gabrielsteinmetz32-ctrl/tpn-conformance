import type { CampaignFacts, ConformResult } from "./types";
import { FACT_FIELDS } from "./types";

/**
 * Renders the conformed email as plain text. This exact string is both what
 * the grader receives as <email> and what the results pane shows, so the two
 * can never disagree about what was graded. Markdown bold markers are left
 * intact — F-08 and R-03 are rules about where bold is allowed, and stripping
 * the markers here would make them ungradeable.
 */
export function serializeEmail(result: ConformResult): string {
  return [
    `SUBJECT: ${result.subject_line?.text ?? ""}`,
    `PREVIEW: ${result.preview_text?.text ?? ""}`,
    "",
    "BODY:",
    result.conformed_body?.text ?? "",
    "",
    "FOOTER:",
    result.footer?.text ?? "",
    "",
    `CTA TEXT: ${result.cta?.text ?? ""}`,
    `CTA URL: ${result.cta?.url ?? ""}`,
  ].join("\n");
}

/** Renders the facts for a prompt, keeping nulls visible as `null`. */
export function serializeFacts(facts: CampaignFacts): string {
  return FACT_FIELDS.map((field) => {
    const value = facts[field];
    return `${field}: ${value === null || value === "" ? "null" : value}`;
  }).join("\n");
}
