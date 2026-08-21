import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Prompts and the spec are read from disk on every request, never inlined as
 * string constants — editing `prompts/*.md` or `spec/*.md` changes behavior
 * without a rebuild. `next.config.ts` traces both directories into the
 * serverless bundle so the reads also work when deployed.
 */
const ROOT = process.cwd();

export async function loadPrompt(name: string): Promise<string> {
  return readFile(path.join(ROOT, "prompts", `${name}.md`), "utf8");
}

export async function loadSpec(): Promise<string> {
  return readFile(path.join(ROOT, "spec", "tpn-email-standards.md"), "utf8");
}

/**
 * The runtime prompts declare their inputs as delimited blocks ("You receive
 * three blocks, delimited below") rather than inline placeholders, so the
 * blocks are appended after the instruction text in the order each prompt
 * documents.
 */
export function withBlocks(
  prompt: string,
  blocks: Array<[tag: string, content: string]>,
): string {
  const rendered = blocks
    .map(([tag, content]) => `<${tag}>\n${content.trim()}\n</${tag}>`)
    .join("\n\n");
  return `${prompt.trimEnd()}\n\n${rendered}\n`;
}
