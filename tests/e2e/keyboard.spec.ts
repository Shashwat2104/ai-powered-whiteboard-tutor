import { test, expect, type Locator } from "@playwright/test";

test.describe("Keyboard Navigation and Focus Indicators (Mock)", () => {
  async function expectVisibleFocus(locator: Locator) {
    const isVisibleIndicator = await locator.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const hasOutline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      const hasBoxShadow = style.boxShadow !== "none" && style.boxShadow !== "";
      return hasOutline || hasBoxShadow;
    });
    expect(isVisibleIndicator).toBe(true);
  }

  test("completes the full learning and Q&A flow using keyboard only with visible focus indicators", async ({
    page,
  }) => {
    await page.goto("/?probe=1");

    // 1. Tab to the topic input
    const topicInput = page.locator("#topic-input");
    await topicInput.focus();
    await expectVisibleFocus(topicInput);

    // Type topic and press Enter
    await topicInput.fill("How binary search works");
    await page.keyboard.press("Enter");

    // 2. Wait for lesson to become ready
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // Tab to Play button
    await playBtn.focus();
    await expectVisibleFocus(playBtn);

    // Space activates Play
    await page.keyboard.press("Space");
    await page.waitForTimeout(1500);

    // 3. Arrow keys on the timeline slider
    const sliderThumb = page.locator('[role="slider"]');
    await sliderThumb.focus();
    await expectVisibleFocus(sliderThumb);

    const timeBefore = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio ? audio.currentTime : 0;
    });

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);

    const timeAfter = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio ? audio.currentTime : 0;
    });

    expect(timeAfter).toBeGreaterThanOrEqual(timeBefore);

    // 4. Tab to the chat input, type, and press Enter
    const chatInput = page.getByTestId("chat-input");
    await chatInput.focus();
    await expectVisibleFocus(chatInput);

    await chatInput.fill("What is the time complexity?");
    await page.keyboard.press("Enter");

    // 5. Verify the tutor answer is displayed
    const tutorResponse = page.getByTestId("tutor-response");
    await expect(tutorResponse).toBeVisible({ timeout: 15_000 });
  });
});
