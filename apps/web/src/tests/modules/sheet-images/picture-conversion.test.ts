import { actualPng, png } from "../image-assets/image-header-fixtures";
import { afterEach, describe, expect, test, vi } from "vitest";
import { convertPictureBlob } from "../../../modules/sheet-images/picture-asset-conversion";
import { createPictureCanvas } from "../../../shared/images/imageAppearance";
vi.mock("../../../shared/images/imageAppearance", () => ({ createPictureCanvas: vi.fn() }));
function fixture(output: Blob | null, decode = true) {
  const revoke = vi.fn();
  const create = vi.fn(() => "blob:synthetic");
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 100;
      naturalHeight = 50;
      onload?: () => void;
      onerror?: () => void;
      set src(_url: string) {
        queueMicrotask(() => (decode ? this.onload?.() : this.onerror?.()));
      }
    },
  );
  const context = { fillStyle: "", globalCompositeOperation: "", fillRect: vi.fn() };
  const canvas = {
    width: 100,
    height: 50,
    getContext: () => context,
    toBlob: vi.fn((done: (value: Blob | null) => void) => done(output)),
  };
  vi.mocked(createPictureCanvas).mockReturnValue(canvas as unknown as HTMLCanvasElement);
  return { canvas, revoke, create, context };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(createPictureCanvas).mockReset();
});
describe("actual picture encoding result", () => {
  test("oversized stored source declarations are rejected before decoder allocation", async () => {
    const f = fixture(null);
    await expect(
      convertPictureBlob(new Blob([png(16385, 1)]), undefined, "png"),
    ).rejects.toMatchObject({ code: "pixel-limit" });
    expect(f.create).not.toHaveBeenCalled();
    expect(createPictureCanvas).not.toHaveBeenCalled();
  });
  test.each(["jpeg", "webp"] as const)(
    "a PNG fallback cannot be reported as %s",
    async (format) => {
      const f = fixture(new Blob(["png"], { type: "image/png" }));
      await expect(convertPictureBlob(new Blob([actualPng]), undefined, format)).rejects.toThrow();
      expect(f.revoke).toHaveBeenCalledWith("blob:synthetic");
      expect(f.canvas.width).toBe(0);
      expect(f.canvas.height).toBe(0);
    },
  );
  test.each([null, new Blob([], { type: "image/jpeg" })])(
    "empty encoded output is rejected",
    async (output) => {
      const f = fixture(output);
      await expect(convertPictureBlob(new Blob([actualPng]), undefined, "jpeg")).rejects.toThrow();
      expect(f.canvas.width).toBe(0);
      expect(f.revoke).toHaveBeenCalledOnce();
    },
  );
  test.each(["png", "jpeg", "webp"] as const)(
    "the exact %s output remains available",
    async (format) => {
      const output = new Blob(["encoded"], { type: `image/${format}` });
      const f = fixture(output);
      await expect(
        convertPictureBlob(new Blob([actualPng]), undefined, format, 2048, 0.75),
      ).resolves.toBe(output);
      expect(f.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), `image/${format}`, 0.75);
      expect(f.revoke).toHaveBeenCalledOnce();
      expect(f.canvas.width).toBe(0);
      if (format === "jpeg") expect(f.context.fillStyle).toBe("#FFFFFF");
    },
  );
  test("decode failure still revokes the source URL", async () => {
    const f = fixture(null, false);
    await expect(convertPictureBlob(new Blob([actualPng]), undefined, "png")).rejects.toThrow();
    expect(f.revoke).toHaveBeenCalledOnce();
    expect(createPictureCanvas).not.toHaveBeenCalled();
  });
});
