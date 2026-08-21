import { callClaude, CONFORM_SCHEMA } from "@/lib/claude";
import { loadPrompt, loadSpec, withBlocks } from "@/lib/prompts";
import { serializeEmail, serializeFacts } from "@/lib/serialize";
import {
  EMPTY_FACTS,
  FACT_FIELDS,
  type CampaignFacts,
  type ConformResult,
} from "@/lib/types";

// One call. Conform and grade are separate requests so neither has to fit
// inside the other's time budget, the email can be shown the moment it
// exists, and a failed grade does not throw away a conform that succeeded.
export const maxDuration = 500;

function normalizeFacts(input: unknown): CampaignFacts {
  const source = (input ?? {}) as Record<string, unknown>;
  const facts = { ...EMPTY_FACTS };
  for (const field of FACT_FIELDS) {
    const value = source[field];
    facts[field] = typeof value === "string" && value.trim() ? value : null;
  }
  return facts;
}

export async function POST(request: Request) {
  let body: { facts?: unknown; draft?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // The draft is optional. With one, we conform it; without one, we write
  // from the campaign facts alone. Both paths return the same shape, so the
  // serializer, the grader, and the results view are identical either way.
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  const mode: "conform" | "generate" = draft ? "conform" : "generate";
  const facts = normalizeFacts(body.facts);

  // Generating needs something to generate from. Conforming does not, because
  // the draft itself carries substance.
  if (mode === "generate" && FACT_FIELDS.every((f) => facts[f] === null)) {
    return Response.json(
      {
        error:
          "Supply a source draft, or fill in at least one campaign fact to " +
          "generate from. With neither there is nothing to write.",
      },
      { status: 400 },
    );
  }

  try {
    const [spec, writePrompt] = await Promise.all([
      loadSpec(),
      loadPrompt(mode === "conform" ? "conform" : "generate"),
    ]);

    const factsText = serializeFacts(facts);
    const started = Date.now();

    // Blocks go in the order each prompt documents; generate.md takes no
    // <draft>.
    const conform = await callClaude<ConformResult>(
      mode,
      withBlocks(
        writePrompt,
        mode === "conform"
          ? [
              ["spec", spec],
              ["campaign_facts", factsText],
              ["draft", draft],
            ]
          : [
              ["spec", spec],
              ["campaign_facts", factsText],
            ],
      ),
      CONFORM_SCHEMA,
    );

    const conformMs = Date.now() - started;
    console.log(`[${mode}] ${conformMs}ms`);

    return Response.json({
      mode,
      conform,
      emailText: serializeEmail(conform),
      timings: { conformMs },
    });
  } catch (error) {
    console.error("conform failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Write failed." },
      { status: 500 },
    );
  }
}
