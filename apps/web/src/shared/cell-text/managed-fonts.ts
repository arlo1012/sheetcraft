export const MANAGED_CELL_FONTS = [
  {
    id: "noto-sans",
    family: "Noto Sans",
    weight: "100 900",
    url: new URL("./fonts/NotoSans.variable.ttf", import.meta.url).href,
  },
  {
    id: "noto-math",
    family: "Noto Sans Math",
    weight: "400",
    url: new URL("./fonts/NotoSansMath-Regular.ttf", import.meta.url).href,
  },
  {
    id: "noto-symbols",
    family: "Noto Sans Symbols",
    weight: "100 900",
    url: new URL("./fonts/NotoSansSymbols.variable.ttf", import.meta.url).href,
  },
  {
    id: "noto-symbols-2",
    family: "Noto Sans Symbols 2",
    weight: "400",
    url: new URL("./fonts/NotoSansSymbols2-Regular.ttf", import.meta.url).href,
  },
] as const;

export type ManagedCellFont = (typeof MANAGED_CELL_FONTS)[number];
export type ManagedCellFontId = ManagedCellFont["id"];

const loading = new Map<string, Promise<void>>();

/** Register/load the exact packaged face, never an unverified local() match. */
export function ensureManagedCellFont(family: string): Promise<void> {
  const font = MANAGED_CELL_FONTS.find((item) => item.family === family);
  if (!font) return Promise.resolve();
  const pending = loading.get(family);
  if (pending) return pending;
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts)
    return Promise.reject(new Error("Font Loading API is unavailable"));
  const face = new FontFace(font.family, `url("${font.url}") format("truetype")`, {
    weight: font.weight,
    style: "normal",
    display: "swap",
  });
  document.fonts.add(face);
  const promise = face.load().then(
    () => undefined,
    (error: unknown) => {
      document.fonts.delete(face);
      loading.delete(family);
      throw error;
    },
  );
  loading.set(family, promise);
  return promise;
}
