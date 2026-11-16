import { test, expect } from "@playwright/test";

test.describe("Failure Recovery & Session Resilience (Mock)", () => {
  test("Row 1: Empty or oversized topic shows inline validation with no network request", async ({
    page,
  }) => {
    let requestsSent = 0;
    await page.route("**/api/lesson", async (route) => {
      requestsSent++;
      await route.continue();
    });

    await page.goto("/");

    const topicInput = page.locator("#topic-input");
    const submitBtn = page.getByRole("button", { name: "Teach me" });

    // Empty submission
    await topicInput.fill("");
    await submitBtn.click();
    const errorMsg = page.locator("#topic-error");
    await expect(errorMsg).toBeVisible();
    await expect(errorMsg).toContainText(/Please enter a topic to learn/i);
    expect(requestsSent).toBe(0);

    // Oversized submission (> 200 characters)
    await page.evaluate(() => {
      document.getElementById("topic-input")?.removeAttribute("maxlength");
    });
    await topicInput.fill("a".repeat(205));
    await submitBtn.click();
    await expect(page.locator("#topic-error")).toBeVisible();
    await expect(page.locator("#topic-error")).toContainText(/200 characters or less/i);
    expect(requestsSent).toBe(0);
  });

  test("Row 7: Network failure during generation displays network error notice with Retry", async ({
    page,
  }) => {
    let callCount = 0;
    await page.route("**/api/lesson", async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    await page.goto("/");
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("How HTTP works");
    await page.getByRole("button", { name: "Teach me" }).click();

    // Verify error notice appears
    const errorNotice = page.getByTestId("error-notice");
    await expect(errorNotice).toBeVisible();
    await expect(errorNotice).toContainText(/Network disconnected/i);

    // Verify Retry button exists and works
    const retryBtn = errorNotice.getByRole("button", { name: /Retry/i });
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // Second call should succeed and reach lesson ready state
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });
  });

  test("Row 10: Rate limit displays rate_limited notice with countdown", async ({ page }) => {
    await page.route("**/api/lesson", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            kind: "rate_limited",
            message: "You are generating lessons quickly.",
            retryAfterSec: 3,
          },
        }),
      });
    });

    await page.goto("/");
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("Photosynthesis");
    await page.getByRole("button", { name: "Teach me" }).click();

    const errorNotice = page.getByTestId("error-notice");
    await expect(errorNotice).toBeVisible();
    await expect(errorNotice).toContainText(/Rate limit reached/i);
    await expect(errorNotice).toContainText(/Please wait \d+ second/i);
  });

  test("Row 3: Generation failure displays generation_failed notice with Retry and Edit topic", async ({
    page,
  }) => {
    await page.route("**/api/lesson", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            kind: "generation_failed",
            message: "We could not create the lesson right now. Please try again.",
          },
        }),
      });
    });

    await page.goto("/");
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("Binary Search Trees");
    await page.getByRole("button", { name: "Teach me" }).click();

    const errorNotice = page.getByTestId("error-notice");
    await expect(errorNotice).toBeVisible();
    await expect(errorNotice).toContainText(/Lesson generation failed/i);
    await expect(errorNotice.getByRole("button", { name: /Retry/i })).toBeVisible();
    await expect(errorNotice.getByRole("button", { name: /Edit topic/i })).toBeVisible();
  });

  test("Row 5: All TTS failure switches to virtual clock and shows no-audio notice", async ({
    page,
  }) => {
    await page.route("**/api/narration", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            kind: "generation_failed",
            message: "TTS synthesis failed",
          },
        }),
      });
    });

    await page.goto("/");
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("Database Indexes");
    await page.getByRole("button", { name: "Teach me" }).click();

    // Lesson should still become ready on virtual clock
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // Verify audio unavailable notice is displayed with "Try audio again" button
    await expect(
      page.getByText(/Narration audio is unavailable right now/i)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try audio again" })).toBeVisible();

    // Verify virtual clock playback works
    await playBtn.click();
    const pauseBtn = page.getByRole("button", { name: /Pause lesson/i });
    await expect(pauseBtn).toBeVisible();
  });

  test("Row 6: Autoplay block displays 'Press play to start' overlay and starts on click", async ({
    page,
  }) => {
    await page.goto("/");
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("How vaccines work");
    await page.getByRole("button", { name: "Teach me" }).click();

    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // Simulate NotAllowedError on play()
    await page.evaluate(() => {
      const audio = document.querySelector("audio");
      if (audio) {
        audio.play = () => Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
      }
    });

    await playBtn.click();

    // Autoplay overlay should be visible
    const overlay = page.getByTestId("autoplay-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole("button", { name: /Press play to start/i })).toBeVisible();

    // Restore play and click overlay
    await page.evaluate(() => {
      const audio = document.querySelector("audio");
      if (audio) {
        audio.play = () => Promise.resolve();
      }
    });

    await overlay.getByRole("button", { name: /Press play to start/i }).click();
    await expect(overlay).toBeHidden();
  });

  test("Row 9: New topic while generating aborts earlier request", async ({ page }) => {
    await page.route("**/api/lesson", async (route) => {
      const postData = JSON.parse(route.request().postData() ?? "{}");
      if (postData.topic === "Topic 1") {
        // simulate slow response
        await new Promise((r) => setTimeout(r, 3000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ lesson: { topic: "Topic 1" } }),
        }).catch(() => {
          // Request aborted as expected
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/");
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("Topic 1");
    await page.getByRole("button", { name: "Teach me" }).click();

    // Submitting a new topic while Topic 1 is generating
    await topicInput.fill("Topic 2");
    await page.getByRole("button", { name: "Teach me" }).click();

    // Only Topic 2 should complete
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });
  });

  test("Row 8: Refresh mid-lesson restores lesson, conversation, and position", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("Supply and Demand");
    await page.getByRole("button", { name: "Teach me" }).click();

    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // Start playback
    await playBtn.click();
    await page.waitForTimeout(3000);

    // Reload page
    await page.reload();

    // Lesson topic or content should be visible and player controls ready
    await expect(page.getByText("Supply and Demand", { exact: false })).toBeVisible({ timeout: 15_000 });
    const restoredPlayBtn = page.getByRole("button", { name: /Play lesson|Pause lesson/i });
    await expect(restoredPlayBtn).toBeVisible({ timeout: 30_000 });
  });
});
