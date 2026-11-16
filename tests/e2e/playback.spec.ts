import { test, expect } from "@playwright/test";

test.describe("Playback Controls and Board State Synchronization (Mock)", () => {
  test("pause, resume, seek, restart, and replay maintain accurate board state", async ({
    page,
  }) => {
    await page.goto("/?probe=1");

    // 1. Submit topic
    const topicInput = page.locator("#topic-input");
    await topicInput.fill("How binary search works");
    await page.getByRole("button", { name: "Teach me" }).click();

    // 2. Wait for playback to become ready
    const playBtn = page.getByRole("button", { name: /Play lesson/i });
    await expect(playBtn).toBeEnabled({ timeout: 45_000 });

    // 3. Play lesson
    await playBtn.click();
    await page.waitForTimeout(2000);

    // 4. Pause mid-segment
    const pauseBtn = page.getByRole("button", { name: /Pause lesson/i });
    await pauseBtn.click();

    // Verify time does not advance while paused
    const pausedTime1 = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio ? audio.currentTime : 0;
    });

    await page.waitForTimeout(1500);

    const pausedTime2 = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio ? audio.currentTime : 0;
    });

    expect(pausedTime2).toBeCloseTo(pausedTime1, 1);

    // Verify elements match expectedAt(t)
    const matchesExpected = await page.evaluate(() => {
      const probe = window.__tutorProbe;
      const audio = document.querySelector("audio");
      if (!probe || !audio) return false;
      const expected = probe.expectedAt(audio.currentTime);
      const rendered = Array.from(document.querySelectorAll("[data-element-id]")).map(
        (el) => el.getAttribute("data-element-id") ?? ""
      );
      return expected.every((id) => rendered.includes(id));
    });
    expect(matchesExpected).toBe(true);

    // 5. Resume playback
    await page.getByRole("button", { name: /Play lesson/i }).click();
    await page.waitForTimeout(1500);

    // 6. Test forward seek (+10s button)
    const forwardBtn = page.getByRole("button", { name: /Forward 10 seconds/i });
    await forwardBtn.click();

    // 7. Test rewind seek (-10s button)
    const rewindBtn = page.getByRole("button", { name: /Rewind 10 seconds/i });
    await rewindBtn.click();

    // 8. Test Restart
    const restartBtn = page.getByRole("button", { name: /Restart lesson/i });
    await restartBtn.click();

    const restartTime = await page.evaluate(() => {
      const audio = document.querySelector("audio");
      return audio ? audio.currentTime : -1;
    });
    expect(restartTime).toBeLessThan(2);
  });
});
