"use client";

import { useState } from "react";
import { buildEml, exportFilename } from "@/lib/export";
import {
  CAMPAIGN_TYPES,
  EMPTY_FACTS,
  FACT_FIELDS,
  fieldLabel,
  type CampaignFacts,
  type FactField,
  type RunResponse,
} from "@/lib/types";

/** Renders `**bold**` markers as bold, leaving all other text untouched. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Evidence({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p className="mt-2 border-l-2 border-neutral-300 pl-3 font-mono text-xs whitespace-pre-wrap text-neutral-600 dark:border-neutral-600 dark:text-neutral-400">
      “{text}”
    </p>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

export default function Home() {
  const [intake, setIntake] = useState("");
  const [facts, setFacts] = useState<CampaignFacts>(EMPTY_FACTS);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<RunResponse | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [running, setRunning] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function setField(field: FactField, value: string) {
    setFacts((prev) => ({ ...prev, [field]: value }));
  }

  async function extractFacts() {
    setExtracting(true);
    setError(null);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Extraction failed.");
      setFacts(data.facts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  /**
   * Two requests, not one. The email is rendered the moment it exists rather
   * than after the grade, and a grade that fails or times out no longer
   * discards a write that succeeded — the result stays on screen and
   * "Grade this" re-runs only the second half.
   */
  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    let written: RunResponse;
    try {
      const response = await fetch("/api/conform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts, draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Write failed.");
      written = { ...data, grade: null, ruleText: {} };
      setResult(written);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Write failed.");
      setRunning(false);
      return;
    }

    setGrading(true);
    try {
      await gradeEmail(written.emailText, written);
    } finally {
      setGrading(false);
      setRunning(false);
    }
  }

  /** Second half of a run, and the retry path when only the grade failed. */
  async function gradeEmail(email: string, base: RunResponse) {
    const response = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facts,
        email,
        unresolved: base.conform?.unresolved ?? [],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Grade failed. The email above is unaffected.");
      return;
    }
    setResult({
      ...base,
      grade: data.grade,
      ruleText: data.ruleText,
      timings: { ...base.timings, gradeMs: data.timings.gradeMs },
    });
  }

  function downloadEml() {
    if (!result?.conform) return;
    const blob = new Blob([buildEml(result.conform)], {
      type: "message/rfc822",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename(result.conform);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyEmail() {
    if (!result) return;
    await navigator.clipboard.writeText(result.emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function gradeOnly() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts, email: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Grade failed.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grade failed.");
    } finally {
      setRunning(false);
    }
  }

  const inputClass =
    "w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
  const buttonClass =
    "rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900";
  const cardClass =
    "rounded border border-neutral-300 p-4 text-sm dark:border-neutral-700";
  const headingClass =
    "mt-6 text-xs font-semibold tracking-wide uppercase text-neutral-500";

  const hasAnyFact = FACT_FIELDS.some((f) => (facts[f] ?? "").trim() !== "");

  const rules = result?.grade?.results ?? [];
  const passed = rules.filter((r) => r.verdict === "pass").length;
  const failures = rules.filter((r) => r.verdict === "fail");
  const notApplicable = rules.filter((r) => r.verdict === "not_applicable");
  const mismatches =
    result?.grade?.fact_checks?.filter((f) => f.verdict === "mismatch") ?? [];
  const unverifiable =
    result?.grade?.fact_checks?.filter((f) => f.verdict === "unverifiable") ?? [];
  // "Needs review" is anything a human must look at before sending: changes the
  // writer was unsure of, plus every rule it could not satisfy. In generate mode
  // there are no changes at all, so counting only those read as 0 next to a list
  // of unresolved rules.
  const lowConfidence =
    result?.conform?.changes?.filter((c) => c.needs_review) ?? [];
  const unresolved = result?.conform?.unresolved ?? [];
  const appendixFindings = result?.grade?.appendix_findings ?? [];
  const needsReviewCount = lowConfidence.length + unresolved.length;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">TPN Conformance</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Extract campaign facts, conform a draft against the standards, then
        grade the result in a separate pass.
      </p>

      {error && (
        <p className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {/* Section 1 — campaign facts */}
      <section className="mt-10">
        <h2 className="text-lg font-medium">1. Campaign facts</h2>
        <textarea
          value={intake}
          onChange={(e) => setIntake(e.target.value)}
          rows={8}
          placeholder="Paste the intake message from the requester…"
          className={`mt-3 ${inputClass} font-mono`}
        />
        <button
          onClick={extractFacts}
          disabled={extracting || !intake.trim()}
          className={`mt-3 ${buttonClass}`}
        >
          {extracting ? "Extracting…" : "Extract facts"}
        </button>
        <p className="mt-2 text-xs text-neutral-500">
          Blank fields mean the intake never stated a value. Fill them in
          yourself — a guess from the model would be a fabrication.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {FACT_FIELDS.map((field) => (
            <label key={field} className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">
                {fieldLabel(field)}
              </span>
              {field === "type" ? (
                <select
                  value={facts.type ?? ""}
                  onChange={(e) => setField("type", e.target.value)}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={facts[field] ?? ""}
                  onChange={(e) => setField(field, e.target.value)}
                  className={inputClass}
                />
              )}
            </label>
          ))}
        </div>
      </section>

      {/* Section 2 — source draft */}
      <section className="mt-12">
        <h2 className="text-lg font-medium">
          2. Source draft{" "}
          <span className="text-sm font-normal text-neutral-500">
            — optional
          </span>
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Leave this empty and the campaign facts above are written up from
          scratch against the standards. With a draft, the draft is conformed
          and its substance preserved.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          placeholder="Paste the draft email, or leave empty to write one from the facts…"
          className={`mt-3 ${inputClass} font-mono`}
        />
      </section>

      {/* Section 3 — run */}
      <section className="mt-12">
        <h2 className="text-lg font-medium">
          3. {draft.trim() ? "Conform" : "Write"} and grade
        </h2>
        <button
          onClick={run}
          disabled={running || (!draft.trim() && !hasAnyFact)}
          className={`mt-3 ${buttonClass}`}
        >
          {running
            ? draft.trim()
              ? "Conforming…"
              : "Writing…"
            : draft.trim()
              ? "Conform and grade"
              : "Write and grade"}
        </button>
        <button
          onClick={gradeOnly}
          disabled={running || !draft.trim()}
          className="mt-3 ml-2 rounded border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-40 dark:border-neutral-700"
          title="Grade the draft exactly as written. No rewriting."
        >
          Grade draft as-is
        </button>
        {running && (
          <p className="mt-3 text-sm text-neutral-500">
            Two sequential model calls across 60 spec rules. This takes several
            minutes — leave the tab open.
          </p>
        )}
      </section>

      {result && (
        <section className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* Left — the conformed email */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-500">
              {result.mode === "generate"
                ? "Generated email"
                : result.mode === "grade"
                  ? "Graded as written"
                  : "Conformed email"}
            </h3>
            {result.conform ? (
              <div className="mt-3 space-y-4 rounded border border-neutral-300 p-5 text-sm dark:border-neutral-700">
                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Subject · {result.conform?.subject_line?.char_count ?? 0} chars
                  </p>
                  <p className="mt-1">
                    <RichText text={result.conform?.subject_line?.text ?? ""} />
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Preview · {result.conform?.preview_text?.char_count ?? 0} chars
                  </p>
                  <p className="mt-1">
                    <RichText text={result.conform?.preview_text?.text ?? ""} />
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Body · {result.conform?.conformed_body?.word_count ?? 0} words
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    <RichText text={result.conform?.conformed_body?.text ?? ""} />
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Footer</p>
                  <p className="mt-1 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                    <RichText text={result.conform?.footer?.text ?? ""} />
                  </p>
                </div>
                <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  <p className="text-xs font-medium text-neutral-500">CTA</p>
                  <p className="mt-1">{result.conform?.cta?.text}</p>
                  <p className="mt-1 font-mono text-xs break-all text-neutral-500">
                    {result.conform?.cta?.url}
                  </p>
                </div>
              </div>
            ) : (
              <pre className="mt-3 overflow-x-auto rounded border border-neutral-300 p-5 text-sm whitespace-pre-wrap dark:border-neutral-700">
                {result.emailText}
              </pre>
            )}
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              hidden={!result.conform}
            >
              <button onClick={downloadEml} className={buttonClass}>
                Export to email
              </button>
              <button
                onClick={copyEmail}
                className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
              >
                {copied ? "Copied" : "Copy as text"}
              </button>
              {unresolved.length > 0 && (
                <span className="text-xs text-amber-700 dark:text-amber-500">
                  {unresolved.length} unresolved — read before sending
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Downloads a .eml draft with no recipient. It opens in your mail
              client unsent — nothing is sent from here.
            </p>

            {unresolved.length > 0 && (
              <>
                <h4 className={headingClass}>
                  Unresolved · blocked on missing input
                </h4>
                <ul className="mt-2 space-y-3">
                  {unresolved.map((u, i) => (
                    <li key={i} className={cardClass}>
                      <p className="font-mono font-medium">{u.rule_id}</p>
                      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                        {u.issue}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {u.why_blocked}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Right — the grade */}
          <div>
            <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-500">
              Grade ·{" "}
              <span
                className={
                  result.grade?.summary?.overall === "pass"
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }
              >
                {result.grade?.summary?.overall ?? "—"}
              </span>
            </h3>

            {!result.grade ? (
              <div className="mt-3 rounded border border-neutral-300 p-5 text-sm dark:border-neutral-700">
                {grading ? (
                  <p className="text-neutral-500">
                    Grading against all 60 rules…
                  </p>
                ) : (
                  <div>
                    <p className="text-neutral-600 dark:text-neutral-400">
                      Not graded. The email is complete and unaffected.
                    </p>
                    <button
                      onClick={() => result && gradeEmail(result.emailText, result)}
                      className={`mt-3 ${buttonClass}`}
                    >
                      Grade this
                    </button>
                  </div>
                )}
              </div>
            ) : (
            <>
            <div className="mt-3 grid grid-cols-2 gap-3 rounded border border-neutral-300 p-5 dark:border-neutral-700">
              <Stat value={passed} label="Rules passed" />
              <Stat value={failures.length} label="Rules failed" />
              <Stat value={mismatches.length} label="Fact mismatches" />
              <Stat value={needsReviewCount} label="Needs review" />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {rules.length} rules evaluated · {notApplicable.length} not
              applicable · {unverifiable.length} facts unverifiable
            </p>
            {result.timings && (
              <p className="mt-1 text-xs text-neutral-500">
                {result.timings.conformMs !== undefined &&
                  `${result.mode === "generate" ? "write" : "conform"} ${(
                    result.timings.conformMs / 1000
                  ).toFixed(1)}s · `}
                {result.timings.gradeMs !== undefined &&
                  `grade ${(result.timings.gradeMs / 1000).toFixed(1)}s`}
              </p>
            )}

            {/* Fact mismatches first — a stale number outranks a style rule. */}
            <h4 className={headingClass}>Fact mismatches</h4>
            {mismatches.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">None.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {mismatches.map((m, i) => (
                  <li key={i} className={cardClass}>
                    <p className="font-medium">{fieldLabel(m.field)}</p>
                    <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                      Facts say{" "}
                      <span className="font-mono text-xs">
                        {m.campaign_facts_value ?? "null"}
                      </span>{" "}
                      · email says{" "}
                      <span className="font-mono text-xs">
                        {m.stated_in_email ?? "—"}
                      </span>
                    </p>
                    <Evidence text={m.stated_in_email} />
                    <p className="mt-1 text-xs text-neutral-500">{m.location}</p>
                  </li>
                ))}
              </ul>
            )}

            <h4 className={headingClass}>Rule failures</h4>
            {failures.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">None.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {failures.map((r, i) => (
                  <li key={i} className={cardClass}>
                    <p className="font-mono font-medium">{r.rule_id}</p>
                    <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                      {r.note ?? result.ruleText?.[r.rule_id] ?? r.rule_id}
                    </p>
                    <Evidence text={r.evidence} />
                    <p className="mt-1 text-xs text-neutral-500">{r.location}</p>
                  </li>
                ))}
              </ul>
            )}

            {appendixFindings.length > 0 && (
              <>
                <h4 className={headingClass}>
                  Appendix findings · detected, not graded
                </h4>
                <ul className="mt-2 space-y-3">
                  {appendixFindings.map((f, i) => (
                    <li key={i} className={cardClass}>
                      <p className="font-medium">
                        Appendix {f.appendix} · {f.item}
                      </p>
                      <Evidence text={f.evidence} />
                      <p className="mt-1 text-xs text-neutral-500">
                        {f.location}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-neutral-500">
                  Banned phrases are not numbered rules and do not change the
                  verdict above. Review them before sending.
                </p>
              </>
            )}
            </>
            )}

            {lowConfidence.length > 0 && (
              <>
                <h4 className={headingClass}>
                  Needs review · low-confidence changes
                </h4>
                <ul className="mt-2 space-y-3">
                  {lowConfidence.map((c, i) => (
                    <li key={i} className={cardClass}>
                      <p className="font-mono font-medium">
                        {c.rule_id}{" "}
                        <span className="text-neutral-500">
                          ({typeof c.confidence === "number"
                            ? c.confidence.toFixed(2)
                            : "—"})
                        </span>
                      </p>
                      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                        {c.reason}
                      </p>
                      <Evidence text={c.original} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
