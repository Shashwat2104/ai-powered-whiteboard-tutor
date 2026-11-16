import "server-only";

export interface RepairIssue {
  code: string;
  path: string;
  message: string;
}

const MAX_LISTED = 25;

/** The message sent back to the model when its output failed validation. */
export function repairMessage(issues: readonly RepairIssue[]): string {
  const listed = issues.slice(0, MAX_LISTED).map((i) => `- [${i.code}] ${i.path}: ${i.message}`);
  const more = issues.length > MAX_LISTED ? `\n(${issues.length - MAX_LISTED} more problems not shown)` : "";
  return [
    "Your reply did not pass validation. Fix every problem below and return the complete corrected JSON object, with no other text.",
    ...listed,
  ].join("\n") + more;
}
