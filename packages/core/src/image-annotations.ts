export type ImageAnnotationPoint = { x: number; y: number };
/** Coordinates and stroke sizes are fractions of the original image dimensions. */
export type ImageAnnotation = {
  kind: "pen" | "arrow" | "rectangle" | "ellipse" | "text";
  points: ImageAnnotationPoint[];
  color: string;
  width: number;
  text?: string;
  fontSize?: number;
};
export function normalizeImageAnnotations(
  value: readonly ImageAnnotation[] | undefined,
): ImageAnnotation[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100)
    throw new TypeError("Invalid image annotations.");
  const result = value.map((entry) => {
    if (
      !entry ||
      !["pen", "arrow", "rectangle", "ellipse", "text"].includes(entry.kind) ||
      !Array.isArray(entry.points) ||
      entry.points.length < 1 ||
      entry.points.length > 1024 ||
      !/^#[0-9a-f]{6}$/i.test(entry.color) ||
      !Number.isFinite(entry.width) ||
      entry.width <= 0 ||
      entry.width > 0.2 ||
      (entry.kind !== "pen" && entry.kind !== "text" && entry.points.length !== 2) ||
      (entry.kind === "text" &&
        (typeof entry.text !== "string" ||
          entry.text.length > 1000 ||
          !Number.isFinite(entry.fontSize) ||
          entry.fontSize! <= 0 ||
          entry.fontSize! > 1))
    )
      throw new TypeError("Invalid image annotation.");
    const points = entry.points.map((point: ImageAnnotationPoint) => {
      if (
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1
      )
        throw new TypeError("Invalid image annotation point.");
      return { x: point.x, y: point.y };
    });
    return {
      kind: entry.kind,
      points,
      color: entry.color.toUpperCase(),
      width: entry.width,
      ...(entry.kind === "text" ? { text: entry.text!, fontSize: entry.fontSize! } : {}),
    };
  });
  return result.length ? result : undefined;
}
