/**
 * Scores drafts/*.md against eval/gold-set.json via the grade-only endpoint.
 *
 * The conform-then-grade pipeline cannot be scored this way: it grades its own
 * output, by which point the labelled violations are fixed. This grades each
 * draft exactly as written, which is what the gold set describes.
 *
 *   node scripts/score-gold-set.mjs [case-id ...]
 */
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const gold = JSON.parse(await readFile("eval/gold-set.json", "utf8"));
const only = process.argv.slice(2);

const cases = gold.cases.filter((c) => !only.length || only.includes(c.id));
let totalCaught = 0;
let totalExpected = 0;

for (const testCase of cases) {
  const path = testCase.source_file.startsWith("drafts/")
    ? testCase.source_file
    : `drafts/${testCase.source_file}`;
  const email = await readFile(path, "utf8");

  const response = await fetch(`${BASE}/api/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts: gold.campaign_facts, email }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.log(`\n${testCase.id}: ERROR ${data.error?.slice(0, 160)}`);
    continue;
  }

  // Appendix items are detected, not graded — they carry no rule ID and are
  // reported separately, so they are scored separately too.
  const allExpected = testCase.expected_violations ?? [];
  const expectedAppendix = allExpected.filter((v) =>
    v.rule_id.startsWith("APPENDIX"),
  );
  const expected = new Set(
    allExpected
      .filter((v) => !v.rule_id.startsWith("APPENDIX"))
      .map((v) => v.rule_id),
  );
  const failed = new Set(
    data.grade.results.filter((r) => r.verdict === "fail").map((r) => r.rule_id),
  );
  const caught = [...expected].filter((id) => failed.has(id));
  const missed = [...expected].filter((id) => !failed.has(id));
  const extra = [...failed].filter((id) => !expected.has(id));

  totalCaught += caught.length;
  totalExpected += expected.size;

  console.log(`\n=== ${testCase.id} (${(data.timings.gradeMs / 1000).toFixed(0)}s) ===`);
  console.log(`violations: ${caught.length}/${expected.size} caught`);
  if (missed.length) console.log(`  missed: ${missed.sort().join(", ")}`);
  if (extra.length) console.log(`  extra:  ${extra.sort().join(", ")}`);

  if (expectedAppendix.length) {
    const found = data.grade.appendix_findings ?? [];
    console.log(
      `appendix: ${found.length} banned phrase(s) found` +
        ` (expected some; not graded)` +
        (found.length ? ` — ${found.map((f) => f.item).join(", ")}` : ""),
    );
  }

  const staleness = testCase.expected_staleness_flags;
  if (staleness) {
    const mismatched = new Set(
      data.grade.fact_checks
        .filter((f) => f.verdict === "mismatch")
        .map((f) => f.field),
    );
    const wantFields = staleness.map((s) => s.field);
    const gotStale = wantFields.filter((f) => mismatched.has(f));
    console.log(
      `fact mismatches: ${gotStale.length}/${wantFields.length}` +
        ` (expected ${testCase.expected_fact_mismatch_count ?? wantFields.length})`,
    );
    const missedStale = wantFields.filter((f) => !mismatched.has(f));
    if (missedStale.length) console.log(`  missed: ${missedStale.join(", ")}`);
  }
}

console.log(`\n${"=".repeat(46)}`);
console.log(`TOTAL violations caught: ${totalCaught}/${totalExpected}`);
