import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  prepareImageAsset,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
} from "../../../modules/image-assets/prepareImageAsset";
import { actualPng, actualGif, gif, png, jpeg } from "./image-header-fixtures";
function fixture(width = 8, height = 4, failure = false) {
  const create = vi.fn(() => "blob:encoded");
  const revoke = vi.fn();
  const src = vi.fn();
  const construct = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = width;
      naturalHeight = height;
      onload?: () => void;
      onerror?: () => void;
      constructor() {
        construct();
      }
      set src(value: string) {
        src(value);
        queueMicrotask(() => (failure ? this.onerror?.() : this.onload?.()));
      }
    },
  );
  return { create, revoke, src, construct };
}
afterEach(() => vi.unstubAllGlobals());
describe("picture preflight and original byte identity", () => {
  test("aborting a pending pixel decode clears its source and releases the URL", async () => {
    const f = fixture();
    let src = "";
    vi.stubGlobal(
      "Image",
      class {
        onload?: () => void;
        onerror?: () => void;
        set src(value: string) {
          src = value;
        }
      },
    );
    const controller = new AbortController();
    const pending = prepareImageAsset(new Blob([actualPng]), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(src).toBe("blob:encoded"));
    controller.abort();
    await rejected;
    expect(src).toBe("");
    expect(f.revoke).toHaveBeenCalledExactlyOnceWith("blob:encoded");
  });

  test("an oversized GIF frame offset never reaches the platform decoder", async () => {
    const f = fixture();
    const bytes = actualGif.slice();
    const descriptor = bytes.indexOf(0x2c);
    new DataView(bytes.buffer).setUint16(descriptor + 1, 65535, true);
    new DataView(bytes.buffer).setUint16(descriptor + 3, 65535, true);
    await expect(prepareImageAsset(new Blob([bytes], { type: "image/gif" }))).rejects.toMatchObject(
      { code: "pixel-limit" },
    );
    expect(f.construct).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  test.each([png(MAX_IMAGE_SIDE + 1, 1), png(8192, 4097), gif(4096, 8192, 8192, 4096)])(
    "an excessive encoded declaration never creates an Image or URL",
    async (bytes) => {
      const f = fixture();
      await expect(
        prepareImageAsset(new Blob([bytes], { type: "image/png" })),
      ).rejects.toMatchObject({ code: "pixel-limit" });
      expect(f.construct).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
    },
  );
  test.each([new Uint8Array(), Uint8Array.of(1, 2, 3), actualPng.subarray(0, 20)])(
    "empty/unknown/broken bytes never reach decoder",
    async (bytes) => {
      const f = fixture();
      await expect(prepareImageAsset(new Blob([bytes], { type: "image/png" }))).rejects.toThrow();
      expect(f.construct).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
    },
  );
  test("encoded byte budget is checked before reading payload", async () => {
    const f = fixture();
    const arrayBuffer = vi.fn();
    const blob = { size: MAX_IMAGE_BYTES + 1, arrayBuffer } as unknown as Blob;
    await expect(prepareImageAsset(blob)).rejects.toMatchObject({ code: "too-large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(f.src).not.toHaveBeenCalled();
  });
  test.each([
    [0, 4, "invalid-image"],
    [1.5, 4, "invalid-image"],
    [MAX_IMAGE_SIDE + 1, 1, "pixel-limit"],
    [8192, 4097, "pixel-limit"],
  ] as const)("decoded %s×%s is rechecked", async (width, height, code) => {
    const f = fixture(width, height);
    await expect(prepareImageAsset(new Blob([actualPng]))).rejects.toMatchObject({ code });
    expect(f.revoke).toHaveBeenCalledExactlyOnceWith("blob:encoded");
  });
  test("decode failure still releases source URL", async () => {
    const f = fixture(8, 4, true);
    await expect(prepareImageAsset(new Blob([actualPng]))).rejects.toMatchObject({
      code: "decode-failed",
    });
    expect(f.revoke).toHaveBeenCalledOnce();
  });
  test("source bytes/hash ignore filename and declared MIME without reencoding", async () => {
    const f = fixture();
    const original = new File([actualPng], "wrong.svg", { type: "image/svg+xml" });
    const result = await prepareImageAsset(original);
    const renamed = await prepareImageAsset(
      new File([actualPng], "other.jpg", { type: "image/jpeg" }),
    );
    expect(result.mimeType).toBe("image/png");
    expect(result.blob.type).toBe("image/png");
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(actualPng);
    expect(result.id).toMatch(/^image-[a-f0-9]{64}$/);
    expect(renamed.id).toBe(result.id);
    expect(result.width).toBe(8);
    expect(f.revoke).toHaveBeenCalledTimes(2);
  });
  test("matching MIME retains the exact original Blob", async () => {
    fixture();
    const original = new Blob([actualPng], { type: "image/png" });
    expect((await prepareImageAsset(original)).blob).toBe(original);
  });
  test("decoded JPEG orientation dimensions need not equal encoded raw axes", async () => {
    fixture(4, 8);
    const result = await prepareImageAsset(new Blob([jpeg(8, 4)], { type: "image/jpeg" }));
    expect(result).toMatchObject({ width: 4, height: 8, mimeType: "image/jpeg" });
    expect(MAX_IMAGE_PIXELS).toBe(32 * 1024 * 1024);
  });
});
