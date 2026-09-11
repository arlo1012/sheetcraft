import type { CellFillGradient } from "@idea10/core/style";

export type GradientPresetStyle =
  | "horizontal"
  | "vertical"
  | "diagonalUp"
  | "diagonalDown"
  | "corner"
  | "center";

export type GradientPresetMatch = {
  style: GradientPresetStyle;
  variant: number;
  color1: string;
  color2: string;
};

const LINEAR_ANGLES: Record<Exclude<GradientPresetStyle, "corner" | "center">, number> = {
  horizontal: 90,
  vertical: 0,
  diagonalUp: 315,
  diagonalDown: 45,
};

const CORNER_POINTS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

function stops(color1: string, color2: string, reverse = false, middle = false) {
  const start = reverse ? color2 : color1;
  const end = reverse ? color1 : color2;
  return middle
    ? [
        { position: 0, color: start },
        { position: 0.5, color: end },
        { position: 1, color: start },
      ]
    : [
        { position: 0, color: start },
        { position: 1, color: end },
      ];
}

export function gradientVariantCount(style: GradientPresetStyle): number {
  if (style === "center") return 2;
  return 4;
}

export function buildGradientPreset(
  style: GradientPresetStyle,
  variant: number,
  color1: string,
  color2: string,
): CellFillGradient {
  const safeVariant = Math.max(0, Math.min(gradientVariantCount(style) - 1, variant));
  if (style in LINEAR_ANGLES) {
    return {
      type: "linear",
      angle: LINEAR_ANGLES[style as keyof typeof LINEAR_ANGLES],
      stops: stops(color1, color2, safeVariant === 1 || safeVariant === 3, safeVariant >= 2),
    };
  }
  if (style === "corner") {
    const [left, top] = CORNER_POINTS[safeVariant]!;
    return {
      type: "path",
      left,
      right: left,
      top,
      bottom: top,
      stops: stops(color1, color2),
    };
  }
  return {
    type: "path",
    left: 0.5,
    right: 0.5,
    top: 0.5,
    bottom: 0.5,
    stops: stops(color1, color2, safeVariant === 1),
  };
}

function sameAngle(left: number, right: number): boolean {
  return (((left - right) % 360) + 360) % 360 === 0;
}

function isTwoStops(gradient: CellFillGradient): boolean {
  return (
    gradient.stops.length === 2 &&
    gradient.stops[0]?.position === 0 &&
    gradient.stops[1]?.position === 1
  );
}

/** Returns a preset only when rebuilding it would retain every gradient detail. */
export function recognizeGradientPreset(
  gradient: CellFillGradient,
): GradientPresetMatch | undefined {
  if (gradient.type === "linear") {
    const style = (Object.entries(LINEAR_ANGLES).find(([, angle]) =>
      sameAngle(gradient.angle, angle),
    )?.[0] ?? undefined) as Exclude<GradientPresetStyle, "corner" | "center"> | undefined;
    if (!style) return undefined;
    const first = gradient.stops[0];
    const middle = gradient.stops[1];
    const last = gradient.stops.at(-1);
    if (isTwoStops(gradient) && first && last) {
      return { style, variant: 0, color1: first.color, color2: last.color };
    }
    if (
      gradient.stops.length === 3 &&
      first?.position === 0 &&
      middle?.position === 0.5 &&
      last?.position === 1 &&
      first.color === last.color
    ) {
      return { style, variant: 2, color1: first.color, color2: middle.color };
    }
    return undefined;
  }

  if (!isTwoStops(gradient)) return undefined;
  const first = gradient.stops[0];
  const last = gradient.stops.at(-1);
  if (!first || !last) return undefined;
  const corner = CORNER_POINTS.findIndex(
    ([left, top]) =>
      gradient.left === left &&
      gradient.right === left &&
      gradient.top === top &&
      gradient.bottom === top,
  );
  if (corner >= 0)
    return {
      style: "corner",
      variant: corner,
      color1: first.color,
      color2: last.color,
    };
  if (
    gradient.left === 0.5 &&
    gradient.right === 0.5 &&
    gradient.top === 0.5 &&
    gradient.bottom === 0.5
  ) {
    return {
      style: "center",
      variant: 0,
      color1: first.color,
      color2: last.color,
    };
  }
  return undefined;
}
