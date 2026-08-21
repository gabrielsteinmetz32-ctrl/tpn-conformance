import { callClaude, FACTS_SCHEMA } from "@/lib/claude";
import { loadPrompt, withBlocks } from "@/lib/prompts";
import { EMPTY_FACTS, FACT_FIELDS, type CampaignFacts } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  let intake: unknown;
  try {
    ({ intake } = await request.json());
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof intake !== "string" || !intake.trim()) {
    return Response.json(
      { error: "An intake message is required." },
      { status: 400 },
    );
  }

  try {
    const prompt = await loadPrompt("extract");
    const raw = await callClaude<Partial<CampaignFacts>>(
      "extract",
      withBlocks(prompt, [["intake_message", intake]]),
      FACTS_SCHEMA,
    );

    // Guarantee all 14 keys, and coerce "" and the literal string "null" to
    // null — extract.md forbids both, and the form renders null as an empty
    // editable input either way.
    const facts = { ...EMPTY_FACTS };
    for (const field of FACT_FIELDS) {
      const value = raw[field];
      const clean = typeof value === "string" ? value.trim() : "";
      facts[field] = clean && clean.toLowerCase() !== "null" ? clean : null;
    }

    return Response.json({ facts });
  } catch (error) {
    console.error("extract failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Extraction failed." },
      { status: 500 },
    );
  }
}
