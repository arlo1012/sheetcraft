import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { PicturePaintResources } from "./picture-detailed-render";

/** A source-free peek separates budget validation from starting image decoding. */
export function createPicturePaintResources(
  theme: WorkbookTheme | undefined,
  urls: ReadonlyMap<string, string> | undefined,
  cache: {
    get: (url: string) => HTMLImageElement | undefined;
    peek?: (url: string) => HTMLImageElement | undefined;
  },
): PicturePaintResources {
  return {
    theme,
    getAssetSize: (id) => {
      const url = urls?.get(id),
        image = url ? cache.peek?.(url) : undefined;
      return image ? { width: image.naturalWidth, height: image.naturalHeight } : undefined;
    },
    getAssetImage: (id) => {
      const url = urls?.get(id);
      return url ? cache.get(url) : undefined;
    },
  };
}
