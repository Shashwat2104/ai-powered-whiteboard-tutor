import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { Timeline } from "@/components/player/Timeline";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

describe("Timeline Slider (DOM)", () => {
  const scenes = [
    { id: "sc1", title: "Introduction", startSec: 0, endSec: 30 },
    { id: "sc2", title: "Core Demonstration", startSec: 30, endSec: 90 },
    { id: "sc3", title: "Recap", startSec: 90, endSec: 130 },
  ];

  it("renders with formatted aria-valuetext and displays scene tick marks", () => {
    render(
      <Timeline
        positionSec={65}
        durationSec={130}
        scenes={scenes}
        onSeek={vi.fn()}
      />
    );

    const slider = screen.getByRole("slider");
    expect(slider).toBeDefined();
    expect(slider.getAttribute("aria-valuetext")).toBe("1:05 of 2:10");
    expect(slider.getAttribute("aria-valuenow")).toBe("65");
    expect(slider.getAttribute("aria-valuemax")).toBe("130");

    // Check that scene ticks are rendered
    const ticks = screen.getAllByTestId("scene-tick");
    expect(ticks.length).toBe(scenes.length);
  });

  it("handles keyboard navigation: arrow keys seek ±5s, Home/End seek to 0/total", () => {
    const handleSeek = vi.fn();
    render(
      <Timeline
        positionSec={65}
        durationSec={130}
        scenes={scenes}
        onSeek={handleSeek}
      />
    );

    const slider = screen.getByRole("slider");

    // ArrowLeft -> -5s
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(handleSeek).toHaveBeenCalledWith(60);

    // ArrowRight -> +5s
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(handleSeek).toHaveBeenCalledWith(70);

    // Home -> 0s
    fireEvent.keyDown(slider, { key: "Home" });
    expect(handleSeek).toHaveBeenCalledWith(0);

    // End -> 130s
    fireEvent.keyDown(slider, { key: "End" });
    expect(handleSeek).toHaveBeenCalledWith(130);
  });
});
