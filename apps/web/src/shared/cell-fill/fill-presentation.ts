import type { CSSProperties } from "vue";
import type {
  CellFillGradient,
  CellFillGradientStop,
  CellFillPatternStyle,
  CellStyle,
} from "@sheetcraft/core/style";

const DEFAULT_PATTERN_COLOR = "#000000";

function svgData(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function svgColor(color: string): string {
  return color.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function patternSvg(pattern: CellFillPatternStyle, color: string): string {
  const foreground = svgColor(color);
  const line = (path: string, opacity = 1) =>
    `<path d="${path}" fill="none" stroke="${foreground}" stroke-width="1" opacity="${opacity}"/>`;
  let body: string;
  switch (pattern) {
    case "darkVertical":
      body = line("M2 0V8 M6 0V8");
      break;
    case "darkHorizontal":
      body = line("M0 2H8 M0 6H8");
      break;
    case "darkGrid":
      body = line("M2 0V8 M6 0V8 M0 2H8 M0 6H8");
      break;
    case "darkTrellis":
      body = line("M-4 4L4-4 M0 8L8 0 M4 12L12 4 M-4 4L4 12 M0 0L8 8 M4-4L12 4");
      break;
    case "darkDown":
      body = line("M-4 4L4 12 M0 0L8 8 M4-4L12 4");
      break;
    case "darkUp":
      body = line("M-4 4L4-4 M0 8L8 0 M4 12L12 4");
      break;
    case "lightVertical":
      body = line("M4 0V8", 0.45);
      break;
    case "lightHorizontal":
      body = line("M0 4H8", 0.45);
      break;
    case "lightGrid":
      body = line("M4 0V8 M0 4H8", 0.45);
      break;
    case "lightTrellis":
      body = line("M-4 4L4-4 M0 8L8 0 M4 12L12 4 M4-4L12 4 M0 0L8 8 M-4 4L4 12", 0.45);
      break;
    case "lightDown":
      body = line("M-4 4L4 12 M0 0L8 8 M4-4L12 4", 0.45);
      break;
    case "lightUp":
      body = line("M-4 4L4-4 M0 8L8 0 M4 12L12 4", 0.45);
      break;
    case "darkGray":
      body = `<path d="M0 0h2v2H0zM2 0h2v2H2zM0 2h2v2H0z" fill="${foreground}"/>`;
      break;
    case "mediumGray":
      body = `<path d="M0 0h2v2H0zM2 2h2v2H2z" fill="${foreground}"/>`;
      break;
    case "lightGray":
      body = `<rect width="2" height="2" fill="${foreground}"/>`;
      break;
    case "gray125":
      body = `<rect width="1" height="1" fill="${foreground}"/><rect x="2" y="2" width="1" height="1" fill="${foreground}"/>`;
      break;
    case "gray0625":
      body = `<rect width="1" height="1" fill="${foreground}"/>`;
      break;
  }
  const size = ["darkGray", "mediumGray", "lightGray", "gray125", "gray0625"].includes(pattern)
    ? 4
    : 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
}

function gradientStops(stops: readonly CellFillGradientStop[]): string {
  return stops
    .map(
      (stop) =>
        `<stop offset="${Math.max(0, Math.min(1, stop.position)) * 100}%" stop-color="${svgColor(stop.color)}"/>`,
    )
    .join("");
}

function cssStops(stops: readonly CellFillGradientStop[]): string {
  return stops
    .map((stop) => `${stop.color} ${Math.max(0, Math.min(1, stop.position)) * 100}%`)
    .join(", ");
}

/** Renders an OOXML path gradient using bands expanding from its focal rectangle. */
function pathGradientSvg(gradient: Extract<CellFillGradient, { type: "path" }>): string {
  const left = Math.max(0, Math.min(1, gradient.left)) * 100;
  const right = Math.max(0, Math.min(1, gradient.right)) * 100;
  const top = Math.max(0, Math.min(1, gradient.top)) * 100;
  const bottom = Math.max(0, Math.min(1, gradient.bottom)) * 100;
  const stops = gradientStops(gradient.stops);
  const center = svgColor(gradient.stops[0]?.color ?? "transparent");
  // SVG antialiasing otherwise reveals hairline seams where the four bands meet.
  const band = (path: string, gradientId: "top" | "bottom" | "left" | "right") =>
    `<path d="${path}" fill="url(#${gradientId})" stroke="url(#${gradientId})" stroke-width="1" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="top" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="0">${stops}</linearGradient><linearGradient id="bottom" gradientUnits="userSpaceOnUse" x1="0" y1="${bottom}" x2="0" y2="100">${stops}</linearGradient><linearGradient id="left" gradientUnits="userSpaceOnUse" x1="${left}" y1="0" x2="0" y2="0">${stops}</linearGradient><linearGradient id="right" gradientUnits="userSpaceOnUse" x1="${right}" y1="0" x2="100" y2="0">${stops}</linearGradient></defs>${band(`M0 0H100L${right} ${top}H${left}Z`, "top")}${band(`M0 100H100L${right} ${bottom}H${left}Z`, "bottom")}${band(`M0 0L${left} ${top}V${bottom}L0 100Z`, "left")}${band(`M100 0L${right} ${top}V${bottom}L100 100Z`, "right")}<rect x="${left}" y="${top}" width="${Math.max(0, right - left)}" height="${Math.max(0, bottom - top)}" fill="${center}"/></svg>`;
}

function gradientStyle(gradient: CellFillGradient): CSSProperties {
  if (gradient.type === "linear") {
    // Excel angle zero runs left-to-right and increases clockwise; CSS zero points up.
    const angle = 90 + gradient.angle;
    return { backgroundImage: `linear-gradient(${angle}deg, ${cssStops(gradient.stops)})` };
  }
  return {
    backgroundImage: svgData(pathGradientSvg(gradient)),
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  };
}

/**
 * Creates the background portion of a cell's presentation. Callers own the
 * fallback surface so sheet cells and small format previews can use their own.
 */
export function getCellFillStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  if (!style) return {};
  if (style.fillGradient) return gradientStyle(style.fillGradient);
  if (style.fillPattern) {
    return {
      ...(style.fillColor ? { backgroundColor: style.fillColor } : {}),
      backgroundImage: svgData(
        patternSvg(style.fillPattern, style.fillPatternColor ?? DEFAULT_PATTERN_COLOR),
      ),
      backgroundRepeat: "repeat",
    };
  }
  return style.fillColor ? { backgroundColor: style.fillColor } : {};
}
