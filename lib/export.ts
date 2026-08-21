import type { ConformResult } from "./types";

/**
 * Builds an RFC 5322 message. Opening the downloaded file puts the campaign
 * into the mail client as an unsent draft with no recipient — this tool
 * hands off a draft, it does not send mail.
 */
export function buildEml(result: ConformResult): string {
  const subject = result.subject_line?.text ?? "";
  const body = [
    result.conformed_body?.text ?? "",
    "",
    result.cta?.text ?? "",
    result.cta?.url ?? "",
    "",
    "---",
    result.footer?.text ?? "",
  ].join("\n");

  // Non-ASCII in a header must be encoded or clients render mojibake. btoa
  // only handles latin1, so the string is UTF-8 encoded byte-wise first.
  // This runs in the browser, so Buffer is not available.
  const encodedSubject = /^[\x20-\x7E]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${btoa(
        String.fromCharCode(...new TextEncoder().encode(subject)),
      )}?=`;

  return [
    "MIME-Version: 1.0",
    "X-Unsent: 1", // opens as a draft rather than a received message
    "To: ",
    `Subject: ${encodedSubject}`,
    `X-Preview-Text: ${result.preview_text?.text ?? ""}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

/** Filename-safe slug from the campaign id or subject. */
export function exportFilename(result: ConformResult): string {
  const base = result.campaign_id || result.subject_line?.text || "campaign";
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "campaign";
  return `${slug}.eml`;
}
