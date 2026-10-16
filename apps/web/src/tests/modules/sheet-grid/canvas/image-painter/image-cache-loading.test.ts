import { afterEach, expect, test, vi } from "vitest";
import { createCanvasImageCache } from "../../../../../modules/sheet-grid/canvas/image-painter";

class FakeImage {
  static instances: FakeImage[] = [];
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.instances.push(this);
  }
  async finish(success: boolean) {
    await Promise.resolve();
    this.complete = true;
    this.naturalWidth = success ? 200 : 0;
    this.naturalHeight = success ? 160 : 0;
    (success ? this.onload : this.onerror)?.();
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  FakeImage.instances = [];
});

test.each([true, false])(
  "decode outcome %s changes state and notifies without duplicate sources",
  async (success) => {
    vi.stubGlobal("Image", FakeImage);
    const changed = vi.fn(),
      cache = createCanvasImageCache(changed);
    expect(cache.state?.("blob:source")).toBeUndefined();
    expect(cache.peek?.("blob:source")).toBeUndefined();
    expect(FakeImage.instances).toHaveLength(0);
    expect(cache.get("blob:source")).toBeUndefined();
    expect(cache.get("blob:source")).toBeUndefined();
    expect(cache.state?.("blob:source")).toBe("loading");
    expect(FakeImage.instances).toHaveLength(1);
    const source = FakeImage.instances[0]!;
    await source.finish(success);
    expect(changed).toHaveBeenCalledOnce();
    expect(cache.state?.("blob:source")).toBe(success ? "ready" : "error");
    expect(cache.get("blob:source")).toBe(success ? source : undefined);
    expect(cache.peek?.("blob:source")).toBe(success ? source : undefined);
    expect(FakeImage.instances).toHaveLength(1);
    cache.dispose();
  },
);

test("eviction and disposal detach delayed events; a later visible URL gets a fresh source", async () => {
  vi.stubGlobal("Image", FakeImage);
  const changed = vi.fn(),
    cache = createCanvasImageCache(changed);
  cache.get("blob:source");
  const first = FakeImage.instances[0]!;
  cache.retain(new Set());
  expect(first.onload).toBeNull();
  expect(first.onerror).toBeNull();
  await first.finish(true);
  expect(changed).not.toHaveBeenCalled();
  expect(cache.state?.("blob:source")).toBeUndefined();
  cache.get("blob:source");
  expect(FakeImage.instances).toHaveLength(2);
  cache.dispose();
  await FakeImage.instances[1]!.finish(false);
  expect(changed).not.toHaveBeenCalled();
  expect(cache.state?.("blob:source")).toBeUndefined();
});
