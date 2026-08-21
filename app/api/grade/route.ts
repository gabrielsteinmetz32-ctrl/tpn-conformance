import { callClaude, GRADE_SCHEMA } from "@/lib/claude";
import { loadPrompt, loadSpec, withBlocks } from "@/lib/prompts";
import { loadRules, ruleIndex } from "@/lib/rules";
import { serializeFacts } from "@/lib/serialize";
import { EMPTY_FACTS, FACT_FIELDS, type CampaignFacts, type GradeResult } from "@/lib/types";

export const maxDuration = 300;

function normalizeFacts(input: unknown): CampaignFacts {
  const source = (input ?? {}) as Record<string, unknown>;
  const facts = { ...EMPTY_FACTS };
  for (const field of FACT_FIELDS) {
    const value = source[field];
    facts[field] = typeof value === "string" && value.trim() ? value : null;
  }
  return facts;
}

/**
 * Grades an email that is already written — no conform step.
 *
 * This is what makes the gold set scoreable. Every case in
 * `eval/gold-set.json` labels violations in the *source draft*, but the
 * conform-then-grade pipeline only ever grades its own output, by which point
 * those violations are fixed. Grading the draft directly is the only way to
 * compare against `expected_violations`.
 */
export async function POST(request: Request) {
  let body: { facts?: unknown; email?: unknown; unresolved?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return Response.json(
      { error: "An email to grade is required." },
      { status: 400 },
    );
  }

  const facts = normalizeFacts(body.facts);

  try {
    const [spec, gradePrompt, rules] = await Promise.all([
      loadSpec(),
      loadPrompt("grade"),
      loadRules(),
    ]);

    const start = Date.now();
    const grade = await callClaude<GradeResult>(
      "grade",
      withBlocks(gradePrompt, [
        ["spec", spec],
        ["campaign_facts", serializeFacts(facts)],
        ["email", email],
      ]),
      GRADE_SCHEMA,
    );
    const gradeMs = Date.now() - start;

    // Backstop, independent of the grader. When a writer ran first it told us
    // which rules it could not satisfy; a placeholder it emitted must never
    // come back as a pass. Deterministic — it does not rely on the grader
    // noticing the brackets. Absent on a plain grade of someone else's draft.
    const blocked = new Map(
      (Array.isArray(body.unresolved) ? body.unresolved : [])
        .filter((u): u is { rule_id: string; why_blocked?: string } =>
          Boolean(u && typeof u === "object" && "rule_id" in u),
        )
        .map((u) => [u.rule_id, u]),
    );
    for (const rule of grade.results ?? []) {
      const block = blocked.get(rule.rule_id);
      if (block && rule.verdict === "pass") {
        rule.verdict = "fail";
        rule.note = `Blocked: ${block.why_blocked ?? "required input missing"}`;
      }
    }
    if (grade.summary && blocked.size > 0) {
      const results = grade.results ?? [];
      grade.summary.failed = results.filter((r) => r.verdict === "fail").length;
      grade.summary.passed = results.filter((r) => r.verdict === "pass").length;
      if (grade.summary.failed > 0) grade.summary.overall = "fail";
    }
    console.log(`[grade-only] grade=${gradeMs}ms`);

    return Response.json({
      mode: "grade",
      emailText: email,
      grade,
      ruleText: ruleIndex(rules),
      timings: { gradeMs },
    });
  } catch (error) {
    console.error("grade failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Grade failed." },
      { status: 500 },
    );
  }
}
