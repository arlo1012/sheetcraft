import { describe, expect, test, vi } from "vitest";
import { isReadonly } from "vue";
import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
} from "../../../../modules/image-assets/imageAssetValidation";
import { fixture, image, MockImage, source } from "./fixture";

describe("selected picture intrinsic dimension loading", () => {
  test("loads only the selected adapter URL and publishes validated natural dimensions", () => {
    const create = vi.spyOn(URL, "createObjectURL");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const declared = { ...source("selected"), width: 17, height: 19 };
    const f = fixture(declared);
    expect(MockImage.instances).toHaveLength(1);
    expect(image().assignedSources).toEqual([declared.url]);
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
    image().succeed(640, 480);
    expect(f.value.status.value).toBe("ready");
    expect(f.value.size.value).toEqual({ ...source("selected"), width: 640, height: 480 });
    expect(isReadonly(f.value.size)).toBe(true);
    expect(isReadonly(f.value.status)).toBe(true);
    expect(isReadonly(f.value.size.value)).toBe(true);
    expect(image().onload).toBeNull();
    expect(image().onerror).toBeNull();
    expect(image().removeAttribute).toHaveBeenCalledExactlyOnceWith("src");
    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  test("an absent source stays idle and creates no decoder", () => {
    const f = fixture(null);
    expect(f.value.status.value).toBe("idle");
    expect(f.value.size.value).toBeUndefined();
    f.value.retry();
    expect(MockImage.instances).toHaveLength(0);
    expect(f.value.status.value).toBe("idle");
  });

  test.each([
    "https://example.com/picture.png",
    "http://example.com/picture.png",
    "//example.com/picture.png",
    "data:image/png;base64,AAAA",
    "file:///picture.png",
    "javascript:alert(1)",
    "/picture.png",
    "",
    "blob:",
    "blob: first",
    " blob:first",
  ])("rejects an unknown or non-blob source without decoding: %s", (url) => {
    const f = fixture(source("asset", url));
    expect(MockImage.instances).toHaveLength(0);
    expect(f.value.status.value).toBe("unavailable");
    expect(f.value.size.value).toBeUndefined();
    f.value.retry();
    expect(MockImage.instances).toHaveLength(0);
  });

  test("rejects a blob URL without a selected asset identity", () => {
    const f = fixture(source(" ", "blob:unknown"));
    expect(MockImage.instances).toHaveLength(0);
    expect(f.value.status.value).toBe("unavailable");
  });

  test.each([
    [0, 20],
    [20, 0],
    [-1, 20],
    [1.5, 20],
    [20, Number.NaN],
    [Number.POSITIVE_INFINITY, 20],
    [Number.MAX_SAFE_INTEGER + 1, 20],
    [MAX_IMAGE_SIDE + 1, 1],
    [1, MAX_IMAGE_SIDE + 1],
    [MAX_IMAGE_SIDE, Math.floor(MAX_IMAGE_PIXELS / MAX_IMAGE_SIDE) + 1],
  ])("invalid or over-budget natural dimensions %s × %s are unavailable", (width, height) => {
    const f = fixture();
    image().succeed(width, height);
    expect(f.value.status.value).toBe("unavailable");
    expect(f.value.size.value).toBeUndefined();
    expect(image().onload).toBeNull();
    expect(image().onerror).toBeNull();
    expect(image().src).toBe("");
    expect(MockImage.instances).toHaveLength(1);
  });

  test("dimensions exactly at the pixel and side budgets are accepted", () => {
    const f = fixture();
    image().succeed(MAX_IMAGE_SIDE, MAX_IMAGE_PIXELS / MAX_IMAGE_SIDE);
    expect(f.value.status.value).toBe("ready");
    expect(f.value.size.value).toMatchObject({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_PIXELS / MAX_IMAGE_SIDE,
    });
  });

  test("decode failure waits for explicit retry, and loading retries do not create extra loaders", () => {
    const f = fixture();
    const failed = image();
    const lateSuccess = failed.onload!;
    failed.fail();
    expect(f.value.status.value).toBe("unavailable");
    expect(MockImage.instances).toHaveLength(1);
    f.selected.value = { ...source("first") };
    expect(MockImage.instances).toHaveLength(1);
    f.value.retry();
    expect(f.value.status.value).toBe("loading");
    expect(MockImage.instances).toHaveLength(2);
    f.value.retry();
    expect(MockImage.instances).toHaveLength(2);
    failed.naturalWidth = 123;
    failed.naturalHeight = 456;
    lateSuccess();
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
    image().succeed(200, 100);
    expect(f.value.size.value).toEqual({ ...source("first"), width: 200, height: 100 });
  });

  test("source assignment failure is unavailable and permits a later retry", () => {
    MockImage.throwOnSource = true;
    const f = fixture();
    expect(f.value.status.value).toBe("unavailable");
    expect(image().onload).toBeNull();
    expect(image().onerror).toBeNull();
    MockImage.throwOnSource = false;
    f.value.retry();
    image().succeed(80, 60);
    expect(f.value.status.value).toBe("ready");
  });

  test("a missing Image constructor is unavailable rather than an unhandled watcher error", () => {
    vi.stubGlobal("Image", undefined);
    const f = fixture();
    expect(f.value.status.value).toBe("unavailable");
    expect(f.value.size.value).toBeUndefined();
    vi.stubGlobal("Image", MockImage);
    f.value.retry();
    image().succeed(80, 60);
    expect(f.value.status.value).toBe("ready");
  });
});
