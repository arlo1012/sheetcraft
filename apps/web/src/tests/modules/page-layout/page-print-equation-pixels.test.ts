import { describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import { createPrintEquationPixels } from "../../../modules/page-layout/page-print-equation-pixels";
import type {
  EquationPresentationReady,
  EquationPresentationService,
} from "../../../modules/sheet-drawings/equation/equation-presentation";

function fixture(count = 1, grouped = false) {
  const sheet = createSheet("Mathematical print", "sheet");
  const roots = Array.from({ length: count }, (_, index) => ({
    ...createGraphicDrawing(`math-${index}`, "equation", "Equation", { row: index, column: 0 }),
    text: index % 2 ? "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}" : "\\frac{a}{\\sqrt{x}}",
    rotation: index ? 0 : 37,
  }));
  sheet.drawings = grouped
    ? [
        {
          kind: "shapeGroup",
          id: "math-owner",
          name: "Math owner",
          rotation: 90,
          shapeFrame: {
            kind: "shape-frame-v1",
            anchor: { mode: "fixed", x: 20, y: 20, size: { width: 240, height: 120 } },
          },
          members: roots.map(
            ({ anchor: _a, offsetX: _x, offsetY: _y, width: _w, height: _h, ...appearance }) => ({
              ...appearance,
              kind: "equation",
              groupFrame: {
                kind: "shape-group-local-v1",
                rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
              },
            }),
          ),
        },
      ]
    : roots;
  const preview = () =>
    createPrintPreviewDocument({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      nativeEquationConsumer: true,
    });
  return { sheet, preview, pass: preview().equationPrintPass! };
}
function pixelsFixture(count = 1, onInvalidate?: () => void, grouped = false) {
  const source = fixture(count, grouped),
    canvases: HTMLCanvasElement[] = [];
  const font = {
    family: "KaTeX_Main",
    weight: "400",
    style: "normal",
    status: "loaded",
  } as FontFace;
  const faces = [font];
  const fonts = Object.assign(new EventTarget(), {
    ready: Promise.resolve(),
    [Symbol.iterator]: () => faces[Symbol.iterator](),
  });
  const makeCanvas = () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
    } as unknown as HTMLCanvasElement;
    canvases.push(canvas);
    return canvas;
  };
  const native = { fonts, createElement: makeCanvas } as unknown as Document;
  const sourceCanvases: HTMLCanvasElement[] = [];
  let valid = true;
  const prepare = vi.fn<EquationPresentationService["prepare"]>(async (input) => {
    valid = true;
    const canvas = {
      width: Math.ceil(input.localW * input.density),
      height: Math.ceil(input.localH * input.density),
    } as HTMLCanvasElement;
    sourceCanvases.push(canvas);
    return {
      status: "ready",
      sourceIdentity: input.sourceIdentity,
      signature: input.source,
      canvas,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      localW: input.localW,
      localH: input.localH,
      displayList: [],
      isValid: () => valid,
    };
  });
  const service: EquationPresentationService = {
    prepare,
    clear: vi.fn(() => {
      valid = false;
      for (const canvas of sourceCanvases) canvas.width = canvas.height = 0;
    }),
    dispose: vi.fn(),
  };
  const consumer = createPrintEquationPixels({ document: native, service, onInvalidate });
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { ...source, consumer, prepare, service, context, canvases, fonts, faces, font };
}
const current = { isCurrent: () => true };
const viewport = { x: 0, y: 0, width: 1000, height: 1000 };

describe("native mathematical print ownership", () => {
  test("uses actual math sources, independently owned pixels and precise rotated placement", async () => {
    const f = pixelsFixture(2),
      before = JSON.stringify(f.sheet.drawings);
    expect(f.consumer.isReady(f.pass)).toBe(false);
    await f.consumer.prepare(f.pass, 2, current);
    expect(f.prepare).toHaveBeenCalledTimes(4);
    expect(f.prepare.mock.calls.map((call) => call[0].source)).toEqual([
      "\\frac{a}{\\sqrt{x}}",
      "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}",
      "\\frac{a}{\\sqrt{x}}",
      "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}",
    ]);
    expect(f.consumer.isReady(f.pass, 2)).toBe(true);
    f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport, 2);
    expect(f.context.drawImage).toHaveBeenCalledWith(f.canvases[0], 0, 0, 240, 120);
    expect(f.context.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(f.context.translate).toHaveBeenCalledWith(128, 68);
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
    f.consumer.dispose();
    expect(f.canvases.every((canvas) => canvas.width === 0)).toBe(true);
  });
  test("two mathematical nodes in one owner keep independent copied pixel surfaces", async () => {
    const f = pixelsFixture(2, undefined, true);
    expect(f.pass.entries[0]!.root).toBe(f.pass.entries[1]!.root);
    expect(f.pass.entries[0]!.sourceNode).not.toBe(f.pass.entries[1]!.sourceNode);
    await f.consumer.prepare(f.pass, 2, current);
    expect(f.canvases).toHaveLength(2);
    expect(f.prepare.mock.calls.map((call) => call[0].sourceIdentity)).toEqual([
      f.pass.entries[0]!.sourceNode,
      f.pass.entries[1]!.sourceNode,
      f.pass.entries[0]!.sourceNode,
      f.pass.entries[1]!.sourceNode,
    ]);
    for (const entry of f.pass.entries) f.consumer.paint(f.context, f.pass, entry, viewport, 2);
    expect(vi.mocked(f.context.drawImage).mock.calls.map((call) => call[0])).toEqual(f.canvases);
    expect(f.consumer.isReady(f.preview().equationPrintPass!, 2)).toBe(true);
    f.consumer.dispose();
    expect(f.canvases.every((canvas) => canvas.width === 0)).toBe(true);
  });
  test("H keeps math readable and V turns native glyphs inside the geometric frame clip", async () => {
    const f = pixelsFixture(2, undefined, true);
    f.pass.entries[0]!.sourceNode.equationFlipX = true;
    f.pass.entries[1]!.sourceNode.equationFlipY = true;
    const pass = f.preview().equationPrintPass!;
    const before = JSON.stringify(f.sheet.drawings);
    await f.consumer.prepare(pass, 2, current);
    f.consumer.paint(f.context, pass, pass.entries[0]!, viewport, 2);
    expect(vi.mocked(f.context.rotate).mock.calls).toEqual([[(127 * Math.PI) / 180]]);
    vi.mocked(f.context.rotate).mockClear();
    vi.mocked(f.context.clip).mockClear();
    f.consumer.paint(f.context, pass, pass.entries[1]!, viewport, 2);
    expect(vi.mocked(f.context.rotate).mock.calls).toEqual([[Math.PI / 2], [Math.PI]]);
    expect(f.context.rect).toHaveBeenCalledWith(0, 0, 240, 120);
    expect(vi.mocked(f.context.clip).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(f.context.rotate).mock.invocationCallOrder[1]!,
    );
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
    f.consumer.dispose();
  });
  test("replacing a real owned math node rejects old pixel leases even for identical content", async () => {
    const f = pixelsFixture(2, undefined, true);
    await f.consumer.prepare(f.pass, 1, current);
    const owner = f.sheet.drawings![0]!;
    if (owner.kind !== "shapeGroup") throw new Error("fixture");
    owner.members[0] = { ...owner.members[0]! };
    expect(f.consumer.isReady(f.pass)).toBe(false);
    const replacement = f.preview().equationPrintPass!;
    expect(f.consumer.isReady(replacement)).toBe(false);
    await f.consumer.prepare(replacement, 1, current);
    expect(f.canvases.slice(0, 2).every((canvas) => canvas.width === 0)).toBe(true);
    expect(f.consumer.isReady(replacement)).toBe(true);
    f.consumer.dispose();
  });
  test("an owned source edit while copying rejects and releases every pending group pixel", async () => {
    const f = pixelsFixture(2, undefined, true),
      original = f.prepare.getMockImplementation()!;
    f.prepare.mockImplementation(async (input, owner) => {
      const result = await original(input, owner);
      if (f.prepare.mock.calls.length === 4)
        f.pass.entries[1]!.sourceNode.name = "Changed during copy";
      return result;
    });
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(/outdated/i);
    expect(f.canvases).toHaveLength(1);
    expect(f.canvases[0]!.width).toBe(0);
    expect(f.consumer.isReady(f.pass)).toBe(false);
    f.consumer.dispose();
  });
  test("preparing more than the adapter's 32 cache entries cannot evict print-owned math", async () => {
    const f = pixelsFixture(40);
    await f.consumer.prepare(f.pass, 1, current);
    expect(f.canvases).toHaveLength(40);
    for (const entry of f.pass.entries) f.consumer.paint(f.context, f.pass, entry, viewport);
    expect(f.context.drawImage).toHaveBeenCalledTimes(40);
    expect(f.canvases.every((canvas) => canvas.width === 240)).toBe(true);
    f.consumer.dispose();
  });
  test("font events and changed FontFace identities invalidate copied surfaces", async () => {
    const invalidate = vi.fn(),
      f = pixelsFixture(1, invalidate);
    await f.consumer.prepare(f.pass, 1, current);
    f.faces[0] = { ...f.font } as FontFace;
    expect(f.consumer.isReady(f.pass)).toBe(false);
    f.fonts.dispatchEvent(new Event("loading"));
    expect(invalidate).toHaveBeenCalledOnce();
    expect(f.canvases[0]!.width).toBe(0);
    expect(() => f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport)).toThrow(
      /not ready/,
    );
    f.consumer.dispose();
  });
  test("superseding requests await release of stale preparation reservations", async () => {
    const f = pixelsFixture(),
      original = f.prepare.getMockImplementation()!;
    let release: (() => void) | undefined;
    f.prepare.mockImplementationOnce(async (input, owner) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(input, owner);
    });
    const first = f.consumer.prepare(f.pass, 1, current);
    const firstResult = first.catch((error) => error as Error);
    const root = f.sheet.drawings![0]!;
    if (root.kind !== "equation") throw new Error("fixture");
    root.text = "y";
    const replacement = f.preview().equationPrintPass!;
    const second = f.consumer.prepare(replacement, 1, current);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    release!();
    expect(await firstResult).toMatchObject({ message: expect.stringContaining("outdated") });
    await second;
    expect(f.prepare).toHaveBeenCalledTimes(3);
    expect(f.consumer.isReady(replacement)).toBe(true);
    f.consumer.dispose();
  });
  test("equivalent rebuilt pagination may consume pixels; changed source or owner cannot", async () => {
    const f = pixelsFixture();
    await f.consumer.prepare(f.pass, 1, current);
    expect(f.consumer.isReady(f.preview().equationPrintPass!)).toBe(true);
    const root = f.sheet.drawings![0]!;
    if (root.kind !== "equation") throw new Error("fixture");
    root.text = "y";
    expect(f.consumer.isReady(f.pass)).toBe(false);
    expect(() => f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport)).toThrow(
      /not ready/,
    );
    f.consumer.dispose();
  });
  test("font failure never publishes partially prepared equations", async () => {
    const f = pixelsFixture(2);
    f.prepare.mockImplementationOnce(async () => ({
      status: "unavailable",
      reason: "font",
      message: "missing math font",
    }));
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(/missing math font/);
    expect(f.consumer.isReady(f.pass)).toBe(false);
    expect(f.canvases).toHaveLength(0);
    f.consumer.dispose();
  });
  test("source changes during awaits reject the entire batch", async () => {
    const f = pixelsFixture(),
      original = f.prepare.getMockImplementation()!;
    f.prepare.mockImplementationOnce(async (input, owner) => {
      const result = await original(input, owner);
      f.sheet.drawings = [...f.sheet.drawings!];
      return result;
    });
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(/outdated/);
    expect(f.consumer.isReady(f.pass)).toBe(false);
    expect(f.canvases).toHaveLength(0);
    f.consumer.dispose();
  });
  test("closed or superseded print ownership cannot publish source pixels", async () => {
    const f = pixelsFixture();
    let active = true;
    const original = f.prepare.getMockImplementation()!;
    f.prepare.mockImplementationOnce(async (input, owner) => {
      const result = await original(input, owner);
      active = false;
      return result;
    });
    await expect(f.consumer.prepare(f.pass, 1, { isCurrent: () => active })).rejects.toThrow(
      /outdated/,
    );
    expect(f.canvases).toHaveLength(0);
    f.consumer.dispose();
  });
  test("one settled font change retries after disposing the entire pending batch", async () => {
    const f = pixelsFixture(2),
      original = f.prepare.getMockImplementation()!;
    f.prepare.mockImplementation(async (input, owner) => {
      const result = await original(input, owner);
      if (f.prepare.mock.calls.length === 4) f.fonts.dispatchEvent(new Event("loading"));
      return result;
    });
    await f.consumer.prepare(f.pass, 1, current);
    expect(f.canvases[0]!.width).toBe(0);
    expect(f.consumer.isReady(f.pass)).toBe(true);
    expect(f.prepare).toHaveBeenCalledTimes(8);
    f.consumer.dispose();
  });
  test("repeated font changes fail explicitly after one bounded retry", async () => {
    const f = pixelsFixture(2),
      original = f.prepare.getMockImplementation()!;
    f.prepare.mockImplementation(async (input, owner) => {
      const result = await original(input, owner);
      if (f.prepare.mock.calls.length === 4 || f.prepare.mock.calls.length === 8)
        f.fonts.dispatchEvent(new Event("loadingdone"));
      return result;
    });
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(/fonts changed/);
    expect(f.canvases.every((canvas) => canvas.width === 0)).toBe(true);
    expect(f.consumer.isReady(f.pass)).toBe(false);
    f.consumer.dispose();
  });
  test("subpixel frame spans preserve glyph density under exact local clipping", async () => {
    const f = pixelsFixture(),
      root = f.sheet.drawings![0]!;
    if (root.kind !== "equation") throw new Error("fixture");
    f.sheet.drawings = [{ ...root, width: 240.25, height: 120.25 }];
    const pass = f.preview().equationPrintPass!;
    await f.consumer.prepare(pass, 2, current);
    f.consumer.paint(f.context, pass, pass.entries[0]!, viewport, 2);
    expect(f.context.rect).toHaveBeenCalledWith(0, 0, 240.25, 120.25);
    expect(f.context.drawImage).toHaveBeenCalledWith(f.canvases[0], 0, 0, 240.5, 120.5);
    expect(f.context.clip).toHaveBeenCalledOnce();
    f.consumer.dispose();
  });
  test("aggregate raster bytes reject before an oversized second allocation", async () => {
    const f = pixelsFixture(3),
      original = f.prepare.getMockImplementation()!;
    f.prepare.mockImplementation(async (input, owner) => {
      const result = await original(input, owner);
      return {
        ...result,
        status: "ready",
        pixelWidth: 4096,
        pixelHeight: 2048,
      } as EquationPresentationReady;
    });
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(/32 MiB/);
    expect(f.canvases).toHaveLength(1);
    expect(f.canvases[0]!.width).toBe(0);
    expect(f.consumer.isReady(f.pass)).toBe(false);
    f.consumer.dispose();
  });
  test("insufficient density and unavailable native canvas do not generate successful prints", async () => {
    const f = pixelsFixture();
    await f.consumer.prepare(f.pass, 1, current);
    expect(f.consumer.isReady(f.pass, 2)).toBe(false);
    expect(() => f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport, 2)).toThrow(
      /not ready/,
    );
    f.consumer.dispose();
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(/outdated/);
  });
});
