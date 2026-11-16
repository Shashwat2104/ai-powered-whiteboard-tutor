import { test, expect } from "@playwright/test";

test.describe("Responsive Viewport and Reduced Motion (Mock)", () => {
  test("at 360x740 viewport, no horizontal overflow occurs and board scales smoothly", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/?probe=1");

    // Check no horizontal overflow on start view
    const initialScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(initialScrollWidth).toBeLessThanOrEqual(360);

    // Submit topic
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("Binary Search");
    await page.getByRole("button", { name: "Teach me" }).click();

    // Wait for lesson ready
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // Verify whiteboard SVG is visible and scaled within viewport
    const boardSvg = page.locator("svg[role='img']").first();
    await expect(boardSvg).toBeVisible();

    const box = await boardSvg.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(360);
      expect(box.width).toBeGreaterThan(250);
    }

    // Verify no horizontal overflow in document
    const readyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(readyScrollWidth).toBeLessThanOrEqual(360);

    // Verify mobile tab list is displayed
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();
  });

  test("with prefers-reduced-motion: reduce, elements appear with data-progress=1 on first frame", async ({
    page,
  }) => {
    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?probe=1");

    const topicInput = page.locator("#topic-input");
    await topicInput.fill("Binary Search");
    await page.getByRole("button", { name: "Teach me" }).click();

    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // Start playback
    await playBtn.click();

    // Wait for elements to appear on the whiteboard
    const firstElement = page.locator("[data-element-id]").first();
    await expect(firstElement).toBeVisible({ timeout: 25_000 });

    // Check all currently rendered elements have data-progress="1"
    const elementsProgress = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("[data-element-id]"));
      return els.map((el) => el.getAttribute("data-progress"));
    });

    expect(elementsProgress.length).toBeGreaterThan(0);
    for (const prog of elementsProgress) {
      expect(prog).toBe("1");
    }

    // Verify probe element id match
    const matchesExpected = await page.evaluate(() => {
      const probe = window.__tutorProbe;
      const audio = document.querySelector("audio");
      if (!probe || !audio) return false;
      const expected = probe.expectedAt(audio.currentTime);
      const rendered = Array.from(document.querySelectorAll("[data-element-id]")).map(
        (el) => el.getAttribute("data-element-id") ?? "",
      );
      return expected.every((id) => rendered.includes(id));
    });

    expect(matchesExpected).toBe(true);
  });
});
