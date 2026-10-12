import {
  normalizeDetailedPictureStyle,
  type PictureColor,
  type PictureGradientPaint,
  type PicturePaint,
  type PicturePaintStop,
} from "@sheetcraft/core/picture-detailed-style";

function canonicalPaint(paint: PicturePaint): PicturePaint {
  const result = normalizeDetailedPictureStyle({ fill: { kind: "value", value: paint } });
  if (result?.fill?.kind !== "value") throw new TypeError("Missing picture paint.");
  return result.fill.value;
}
function canonicalGradient(paint: PictureGradientPaint): PictureGradientPaint {
  const result = canonicalPaint(paint);
  if (result.kind !== "linear" && result.kind !== "radial" && result.kind !== "rectangular")
    throw new TypeError("Expected a picture gradient.");
  return result;
}
function stopIndex(gradient: PictureGradientPaint, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= gradient.stops.length)
    throw new RangeError("Selected picture gradient stop no longer exists.");
}

export function createPictureSolidPaint(): Extract<PicturePaint, { kind: "solid" }> {
  return { kind: "solid", color: { kind: "theme", reference: { slot: "accent1" } }, opacity: 1 };
}
export function createPictureGradientPaint(): PictureGradientPaint {
  return {
    kind: "linear",
    angleDeg: 90,
    opacity: 1,
    rotateWithShape: true,
    stops: [
      {
        offset: 0,
        color: { kind: "theme", reference: { slot: "accent1" } },
        opacity: 1,
        brightness: 0.8,
      },
      {
        offset: 1,
        color: { kind: "theme", reference: { slot: "accent1" } },
        opacity: 1,
        brightness: 0,
      },
    ],
  };
}
export function changePictureGradientKind(
  gradient: PictureGradientPaint,
  kind: PictureGradientPaint["kind"],
): PictureGradientPaint {
  const { stops, opacity, rotateWithShape } = canonicalGradient(gradient);
  return canonicalGradient(
    kind === "linear"
      ? {
          kind,
          stops,
          opacity,
          rotateWithShape,
          angleDeg: gradient.kind === "linear" ? gradient.angleDeg : 90,
        }
      : {
          kind,
          stops,
          opacity,
          rotateWithShape,
          centerX: gradient.kind === "linear" ? 0.5 : gradient.centerX,
          centerY: gradient.kind === "linear" ? 0.5 : gradient.centerY,
          radiusX: gradient.kind === "linear" ? 0.5 : gradient.radiusX,
          radiusY: gradient.kind === "linear" ? 0.5 : gradient.radiusY,
        },
  );
}

/** Selection follows the edited stop through a stable sort, including hard stops. */
export function editPictureGradientStop(
  gradient: PictureGradientPaint,
  index: number,
  patch: Partial<PicturePaintStop>,
): { gradient: PictureGradientPaint; selectedIndex: number } {
  const current = canonicalGradient(gradient);
  stopIndex(current, index);
  const entries = current.stops.map((stop, position) => ({
    stop: position === index ? { ...stop, ...patch } : stop,
    selected: position === index,
  }));
  entries.sort((a, b) => a.stop.offset - b.stop.offset);
  return {
    gradient: canonicalGradient({ ...current, stops: entries.map((entry) => entry.stop) }),
    selectedIndex: entries.findIndex((entry) => entry.selected),
  };
}

/** New stops inherit a neighbor's live color reference instead of baking RGB. */
export function addPictureGradientStop(gradient: PictureGradientPaint): {
  gradient: PictureGradientPaint;
  selectedIndex: number;
} {
  const current = canonicalGradient(gradient);
  if (current.stops.length >= 16)
    throw new RangeError("Picture gradients support at most 16 stops.");
  let index = 0,
    gap = -1;
  for (let position = 0; position < current.stops.length - 1; position++) {
    const next = current.stops[position + 1]!.offset - current.stops[position]!.offset;
    if (next > gap) {
      gap = next;
      index = position;
    }
  }
  const left = current.stops[index]!,
    right = current.stops[index + 1]!;
  const stop = {
    ...left,
    offset: (left.offset + right.offset) / 2,
    opacity: (left.opacity + right.opacity) / 2,
    brightness: (left.brightness + right.brightness) / 2,
  };
  const stops = [...current.stops];
  stops.splice(index + 1, 0, stop);
  return { gradient: canonicalGradient({ ...current, stops }), selectedIndex: index + 1 };
}
export function removePictureGradientStop(
  gradient: PictureGradientPaint,
  index: number,
): { gradient: PictureGradientPaint; selectedIndex: number } {
  const current = canonicalGradient(gradient);
  stopIndex(current, index);
  if (current.stops.length <= 2)
    throw new RangeError("A picture gradient needs at least two stops.");
  const stops = current.stops.filter((_, position) => position !== index);
  return {
    gradient: canonicalGradient({ ...current, stops }),
    selectedIndex: Math.min(index, stops.length - 1),
  };
}

/** Reuses exact theme identity from the palette's second argument. */
export function picturePaintColorFromSelection(
  rgb: string | null,
  reference?: Extract<PictureColor, { kind: "theme" }>["reference"],
): PictureColor {
  const color: PictureColor = reference
    ? { kind: "theme", reference: { ...reference } }
    : rgb === null
      ? { kind: "automatic" }
      : { kind: "rgb", rgb };
  const paint = canonicalPaint({ kind: "solid", color, opacity: 1 });
  if (paint.kind !== "solid") throw new TypeError("Expected solid paint.");
  return paint.color;
}

export function getPictureStretchOffsets(
  layout: Extract<Extract<PicturePaint, { kind: "picture" }>["layout"], { kind: "stretch" }>,
) {
  return {
    left: layout.offsetXRatio * 100,
    top: layout.offsetYRatio * 100,
    right: (1 - layout.offsetXRatio - layout.widthRatio) * 100,
    bottom: (1 - layout.offsetYRatio - layout.heightRatio) * 100,
  };
}
export function editPictureStretchOffset(
  paint: Extract<PicturePaint, { kind: "picture" }>,
  side: "left" | "right" | "top" | "bottom",
  percent: number,
): Extract<PicturePaint, { kind: "picture" }> {
  if (paint.layout.kind !== "stretch")
    throw new TypeError("Choose stretch picture fill before editing its offsets.");
  if (!Number.isFinite(percent)) throw new RangeError("Picture stretch offset must be finite.");
  const offsets = { ...getPictureStretchOffsets(paint.layout), [side]: percent };
  const result = canonicalPaint({
    ...paint,
    layout: {
      kind: "stretch",
      offsetXRatio: offsets.left / 100,
      offsetYRatio: offsets.top / 100,
      widthRatio: 1 - (offsets.left + offsets.right) / 100,
      heightRatio: 1 - (offsets.top + offsets.bottom) / 100,
    },
  });
  if (result.kind !== "picture") throw new TypeError("Expected picture paint.");
  return result;
}
