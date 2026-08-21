import { loadSpec } from "./prompts";

export type SpecRule = { id: string; text: string };

const RULE_LINE = /^\*\*([VTFSARL]-\d+)\.\*\*\s*(.+)$/;

/**
 * Parses rule IDs and their text out of the spec.
 *
 * Neither model is asked to echo rule text back any more — the rule ID is a
 * key into this table, and quoting all 60 rules was the single largest block
 * of generated output. Resolving the text here costs nothing and cannot drift
 * from the spec the way a quoted copy can.
 */
export async function loadRules(): Promise<SpecRule[]> {
  const spec = await loadSpec();
  const rules: SpecRule[] = [];
  for (const line of spec.split("\n")) {
    const match = RULE_LINE.exec(line.trim());
    if (match) rules.push({ id: match[1], text: match[2].trim() });
  }
  return rules;
}

export function ruleIndex(rules: SpecRule[]): Record<string, string> {
  return Object.fromEntries(rules.map((r) => [r.id, r.text]));
}
