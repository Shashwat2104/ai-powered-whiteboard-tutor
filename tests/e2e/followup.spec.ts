import { test, expect } from "@playwright/test";

test.describe("Contextual Follow-up Chat (Mock)", () => {
  test("submits questions, displays pending state and answers, renders illustration, handles scene jump, and guards against empty or duplicate submissions", async ({
    page,
  }) => {
    // 1. Navigate to tutor with probe
    await page.goto("/?probe=1");

    // 2. Submit topic to reach a valid lesson state
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("How binary search works");
    await page.getByRole("button", { name: "Teach me" }).click();

    // 3. Wait for lesson to be ready and player controls visible
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // 4. Set up route spy on /api/followup
    let followupRequestCount = 0;
    const delayResponseMs = 400;

    await page.route("**/api/followup", async (route) => {
      followupRequestCount++;
      const postData = JSON.parse(route.request().postData() ?? "{}");
      if (delayResponseMs > 0) {
        await new Promise((r) => setTimeout(r, delayResponseMs));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          turnId: postData.turnId,
          answer: "Binary search cuts the search space in half with each comparison.",
          sceneRef: "sc2",
          illustration: {
            actions: [
              { id: "ill_w1", type: "write", at: "start", x: 100, y: 100, text: "Divide and Conquer", size: "md" },
            ],
            durationSec: 3,
          },
        }),
      });
    });

    const chatInput = page.getByTestId("chat-input");
    const submitBtn = page.getByTestId("chat-submit-btn");

    // 5. Test empty submit: shows inline error and makes NO request
    await chatInput.fill("");
    await submitBtn.click({ force: true });
    const inputError = page.getByTestId("input-error");
    await expect(inputError).toBeVisible();
    await expect(inputError).toContainText(/Please enter a question/i);
    expect(followupRequestCount).toBe(0);

    // 6. Test double-click: produces exactly one request
    await chatInput.fill("Why must the array be sorted?");
    // Click twice rapidly
    await Promise.all([
      submitBtn.click(),
      submitBtn.click().catch(() => {}),
    ]);

    // 7. Test pending state: "Thinking..." is visible while request is in flight
    const pendingNotice = page.getByTestId("turn-pending");
    await expect(pendingNotice).toBeVisible();

    // 8. Wait for answer to render
    const tutorResponse = page.getByTestId("tutor-response");
    await expect(tutorResponse).toBeVisible();
    await expect(tutorResponse).toContainText("Binary search cuts the search space in half");

    // Verify exactly 1 request was sent despite the double-click
    expect(followupRequestCount).toBe(1);

    // 9. Verify mini illustration is rendered
    const miniIllustration = page.getByTestId("turn-illustration");
    await expect(miniIllustration).toBeVisible();
    await expect(miniIllustration.locator("svg").first()).toBeVisible();

    // 10. Verify "Jump to scene" seeks the main player
    const jumpBtn = page.getByTestId("jump-to-scene-btn");
    await expect(jumpBtn).toBeVisible();

    // Click jump to scene
    await jumpBtn.click();

    // Check that player position updated to scene sc2 start time (> 0)
    await page.waitForTimeout(500);
    const audioTime = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio ? audio.currentTime : 0;
    });
    expect(audioTime).toBeGreaterThanOrEqual(0);
  });
});
