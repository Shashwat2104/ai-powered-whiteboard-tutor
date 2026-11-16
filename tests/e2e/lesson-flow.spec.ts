import { test, expect } from "@playwright/test";

test.describe("Lesson Flow (Mock)", () => {
  test("submits topic, progresses through generation, plays lesson, and completes knowledge check", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Fill topic form
    const topicInput = page.locator("#topic-input");
    await expect(topicInput).toBeVisible();
    await topicInput.fill("How binary search works");

    const submitBtn = page.getByRole("button", { name: "Teach me" });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 2. Observe progress steps
    const progressContainer = page.locator("[aria-live='polite']").first();
    await expect(progressContainer).toBeVisible();
    await expect(page.getByText("Writing lesson")).toBeVisible();

    // 3. Play button becomes enabled when ready
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // 4. Press Play
    await playBtn.click();

    // 5. Whiteboard elements with data-element-id appear
    const elements = page.locator("[data-element-id]");
    await expect(elements.first()).toBeVisible({ timeout: 10_000 });

    // 6. Knowledge check is present and interactable
    const knowledgeCheck = page.getByTestId("knowledge-check");
    await expect(knowledgeCheck).toBeVisible({ timeout: 15_000 });

    // 7. Choose correct answer
    const option = page.getByRole("radio", {
      name: "Discard the half that cannot hold the target",
    });
    await option.check();

    const checkAnswerBtn = page.getByRole("button", { name: "Check Answer" });
    await checkAnswerBtn.click();

    // 8. Feedback shows Correct with explanation
    const statusMsg = page.getByRole("status");
    await expect(statusMsg).toBeVisible();
    await expect(page.getByText("Correct!")).toBeVisible();
    await expect(
      page.getByText("Because the list is sorted, one comparison rules out half of the remaining items.")
    ).toBeVisible();
  });
});
