import { webcrypto } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";
import { imageAssetFeedback } from "../../../modules/image-assets/imageAssetFeedback";
import { readEncodedImageSource } from "../../../modules/image-assets/readEncodedImageSource";
import { bitmap } from "./bmp-header-fixtures";

function decoder(width = 32, height = 16, failed = false) {
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:encoded-source");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const construct = vi.fn(),
    setSource = vi.fn();
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
        setSource(value);
        queueMicrotask(() => (failed ? this.onerror?.() : this.onload?.()));
      }
    },
  );
  return { create, revoke, construct, setSource };
}
function svg(
  contents = '<rect width="32" height="16" fill="red"/>',
  attributes = 'width="32" height="16"',
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${contents}</svg>`;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("BMP bytes determine MIME and original content identity, not filename", async () => {
  const f = decoder(3, 2),
    bytes = bitmap();
  const asset = await prepareImageAsset(
    new File([bytes], "picture.svg", { type: "image/svg+xml" }),
  );
  expect(asset).toMatchObject({ width: 3, height: 2, mimeType: "image/bmp" });
  expect(new Uint8Array(await asset.blob.arrayBuffer())).toEqual(bytes);
  expect(asset.id).toMatch(/^image-[a-f0-9]{64}$/);
  expect(f.revoke).toHaveBeenCalledExactlyOnceWith("blob:encoded-source");
});
test("safe static SVG preserves literal text, MIME and source bytes", async () => {
  const f = decoder(),
    text = svg(
      '<g fill="red"><rect width="32" height="16"/><text x="1" y="10">safe &amp; literal</text></g>',
    );
  const input = new Blob([text], { type: "image/svg+xml" });
  const asset = await prepareImageAsset(input);
  expect(asset.blob).toBe(input);
  expect(await asset.blob.text()).toBe(text);
  expect(asset).toMatchObject({ width: 32, height: 16, mimeType: "image/svg+xml" });
  expect(f.construct).toHaveBeenCalledOnce();
  expect(f.create).toHaveBeenCalledOnce();
});
test("SVG masquerading as a raster is preflighted and given the verified MIME", async () => {
  decoder();
  const text = svg();
  const asset = await prepareImageAsset(new File([text], "wrong.png", { type: "image/png" }));
  expect(asset.mimeType).toBe("image/svg+xml");
  expect(asset.blob.type).toBe("image/svg+xml");
  expect(await asset.blob.text()).toBe(text);
});
test("viewBox-only viewport is canonicalized before any source decode/storage", async () => {
  decoder(300, 150);
  const original = svg('<rect width="32" height="16"/>', 'viewBox="0 0 32 16"');
  const result = await readEncodedImageSource(new Blob([original], { type: "image/svg+xml" }));
  expect(result.header).toMatchObject({ width: 300, height: 150, mimeType: "image/svg+xml" });
  const canonical = await result.blob.text();
  expect(canonical).not.toBe(original);
  expect(canonical).toContain('width="300px"');
  expect(canonical).toContain('height="150px"');
  expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(result.bytes);
  const first = await prepareImageAsset(new Blob([original], { type: "image/svg+xml" }));
  const second = await prepareImageAsset(result.blob);
  expect(first.id).toBe(second.id);
});
test.each([
  svg("<script>alert(1)</script>"),
  svg('<rect width="10" height="10" onclick="alert(1)"/>'),
  svg('<use href="https://example.invalid/private.svg#id"/>'),
  svg(
    '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>',
  ),
  '<!DOCTYPE svg [<!ENTITY x "boom">]>' + svg("<text>&x;</text>"),
  svg("", 'width="16385" height="1"'),
])("unsafe or excessive SVG never creates a source URL or Image", async (text) => {
  const f = decoder();
  await expect(prepareImageAsset(new Blob([text], { type: "image/svg+xml" }))).rejects.toThrow();
  expect(f.create).not.toHaveBeenCalled();
  expect(f.construct).not.toHaveBeenCalled();
});
test("malformed or unsupported BMP fails before decode with useful feedback", async () => {
  const f = decoder(),
    compressed = bitmap({ compression: 1 });
  let error: unknown;
  try {
    await prepareImageAsset(new Blob([compressed]));
  } catch (caught) {
    error = caught;
  }
  expect(imageAssetFeedback(error)).toBe("image.bmpUnsupported");
  expect(f.create).not.toHaveBeenCalled();
  expect(f.construct).not.toHaveBeenCalled();
  const linked = bitmap({ header: 124 });
  new DataView(linked.buffer).setUint32(70, 0x4c494e4b, true);
  try {
    await prepareImageAsset(new Blob([linked]));
  } catch (caught) {
    error = caught;
  }
  expect(imageAssetFeedback(error)).toBe("image.svgUnsafe");
});
test("SVG unsafe and unsupported-feature failures show actionable messages", async () => {
  for (const [text, key] of [
    [svg("<script/>"), "image.svgUnsafe"],
    [svg('<filter id="f"/>'), "image.svgUnsupported"],
  ] as const) {
    let error: unknown;
    try {
      await readEncodedImageSource(new Blob([text]));
    } catch (caught) {
      error = caught;
    }
    expect(imageAssetFeedback(error)).toBe(key);
  }
});
test("platform decode refusal releases a safe source URL", async () => {
  const f = decoder(32, 16, true);
  await expect(prepareImageAsset(new Blob([svg()]))).rejects.toMatchObject({
    code: "decode-failed",
  });
  expect(f.revoke).toHaveBeenCalledOnce();
});
