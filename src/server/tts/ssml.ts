import "server-only";

const MARKER = /\[\[(m\d{1,3})\]\]/g;
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

const escapeXml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Build SSML for Google TTS: text is escaped, and each `[[mN]]` marker becomes `<mark name="mN"/>`. */
export function toSsml(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const index = match.index ?? 0;
    out += escapeXml(text.slice(last, index)) + `<mark name="${match[1]}"/>`;
    last = index + match[0].length;
  }
  return `<speak>${out}${escapeXml(text.slice(last))}</speak>`;
}
