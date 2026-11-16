import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";

test.describe("Accessibility Audits (Axe Core)", () => {
  test("start view, playing lesson, and chat have zero critical or serious accessibility violations", async ({ page }) => {
    const evidenceDir = path.join(process.cwd(), "docs", "evidence", "a11y");
    await fs.mkdir(evidenceDir, { recursive: true });

    // 1. Audit Start View
    await page.goto("/?probe=1");
    const startAxe = await new AxeBuilder({ page }).analyze();
    const startViolations = startAxe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    await fs.writeFile(
      path.join(evidenceDir, "start-view-a11y.json"),
      JSON.stringify(startAxe, null, 2),
    );
    expect(startViolations, `Start view had violations: ${JSON.stringify(startViolations, null, 2)}`).toHaveLength(0);

    // 2. Submit topic & reach playing lesson
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("How binary search works");
    await page.getByRole("button", { name: "Teach me" }).click();

    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });
    await playBtn.click();
    await page.waitForTimeout(2000);

    // Audit Playing Lesson
    const playingAxe = await new AxeBuilder({ page }).analyze();
    const playingViolations = playingAxe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    await fs.writeFile(
      path.join(evidenceDir, "playing-lesson-a11y.json"),
      JSON.stringify(playingAxe, null, 2),
    );
    expect(playingViolations, `Playing lesson had violations: ${JSON.stringify(playingViolations, null, 2)}`).toHaveLength(0);

    // 3. Follow-up chat with an answer
    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("Why must the array be sorted?");
    await page.getByTestId("chat-submit-btn").click();

    const tutorResponse = page.getByTestId("tutor-response");
    await expect(tutorResponse).toBeVisible({ timeout: 15_000 });

    const chatAxe = await new AxeBuilder({ page }).analyze();
    const chatViolations = chatAxe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    await fs.writeFile(
      path.join(evidenceDir, "chat-answer-a11y.json"),
      JSON.stringify(chatAxe, null, 2),
    );
    expect(chatViolations, `Chat answer had violations: ${JSON.stringify(chatViolations, null, 2)}`).toHaveLength(0);
  });
});
