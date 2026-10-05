import { afterEach, describe, expect, test, vi } from "vitest";
import { captureScreen } from "../../../modules/insert-tools/captureScreen";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fixture(mode: "loaded" | "error" | "waiting" = "loaded") {
  const stops = [vi.fn(), vi.fn()];
  const stream = { getTracks: () => stops.map((stop) => ({ stop })) } as unknown as MediaStream;
  const getDisplayMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  Object.defineProperties(video, {
    videoWidth: { value: 8000 },
    videoHeight: { value: 4000 },
    srcObject: { value: null, writable: true },
  });
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  vi.spyOn(video, "play").mockImplementation(async () => {
    if (mode === "loaded") video.dispatchEvent(new Event("loadeddata"));
    if (mode === "error") video.dispatchEvent(new Event("error"));
  });
  const drawImage = vi.fn();
  vi.spyOn(canvas, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(canvas, "toBlob").mockImplementation((callback) =>
    callback(new Blob(["PNG"], { type: "image/png" })),
  );
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) =>
    tag === "video" ? video : tag === "canvas" ? canvas : create(tag, options),
  );
  return { video, canvas, stops, pause, getDisplayMedia, drawImage };
}

describe("screen capture", () => {
  test("returns null when the user rejects the browser capture picker", async () => {
    const getDisplayMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("Canceled", "NotAllowedError"));
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    expect(await captureScreen()).toBeNull();
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });

  test("encodes a PNG frame, bounds its size and releases every capture track", async () => {
    const f = fixture();
    const file = await captureScreen();
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("screenshot.png");
    expect(file?.type).toBe("image/png");
    expect(file?.size).toBe(3);
    expect(f.canvas.width).toBe(4096);
    expect(f.canvas.height).toBe(2048);
    expect(f.drawImage).toHaveBeenCalledExactlyOnceWith(f.video, 0, 0, 4096, 2048);
    for (const stop of f.stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(f.pause).toHaveBeenCalledTimes(1);
    expect(f.video.srcObject).toBeNull();
    expect(f.video.onloadeddata).toBeNull();
    expect(f.video.onerror).toBeNull();
  });

  test("releases capture tracks after the video fails", async () => {
    const f = fixture("error");
    await expect(captureScreen()).rejects.toThrow("Screen capture failed");
    for (const stop of f.stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(f.pause).toHaveBeenCalledTimes(1);
    expect(f.video.srcObject).toBeNull();
    expect(f.video.onloadeddata).toBeNull();
    expect(f.video.onerror).toBeNull();
  });

  test.each([{}, { mediaDevices: {} }])(
    "rejects when the display capture API is missing",
    async (navigatorValue) => {
      vi.stubGlobal("navigator", navigatorValue);
      await expect(captureScreen()).rejects.toThrow("Screen capture is unavailable");
    },
  );

  test("clears event handlers and stops every track when frame loading times out", async () => {
    vi.useFakeTimers();
    const f = fixture("waiting");
    const pending = captureScreen();
    const rejection = expect(pending).rejects.toThrow("Screen capture timed out");
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    for (const stop of f.stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(f.pause).toHaveBeenCalledTimes(1);
    expect(f.video.srcObject).toBeNull();
    expect(f.video.onloadeddata).toBeNull();
    expect(f.video.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
