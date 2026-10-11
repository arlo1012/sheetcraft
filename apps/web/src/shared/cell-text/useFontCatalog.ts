import { computed, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useAppI18n } from "../i18n";
import { createFontFamilyOptions, getFontFamilyAliases } from "./font-catalog";
import { localFontAccess } from "./local-fonts";
import { useLocalSymbolFonts } from "./local-font-source";
import {
  ensureCellFontResource,
  getCellFontResourceFamilies,
  useCellFontResources,
} from "./font-resources";

export function useFontCatalog(current: MaybeRefOrGetter<readonly string[]> = []) {
  const { locale } = useAppI18n();
  const { fonts } = useLocalSymbolFonts();
  const { revision: fontResourceRevision } = useCellFontResources();
  // Only families actually used by this editor/preview are prepared. The font
  // catalog itself never scans system fonts, reads all saved faces, or loads all presets.
  watch(
    () => [...toValue(current)],
    (families) => {
      const owned = new Set(families.flatMap((family) => getCellFontResourceFamilies(family)));
      for (const family of owned) void ensureCellFontResource(family).catch(() => undefined);
    },
    { immediate: true },
  );
  const fontOptions = computed(() => {
    const registered = new Map(fonts.value.map((font) => [font.family, font]));
    return createFontFamilyOptions(locale.value, [
      ...toValue(current),
      ...localFontAccess.families.value,
      ...registered.keys(),
    ]).map((option) => {
      const font = registered.get(option.value);
      return {
        ...option,
        ...(font ? { label: `${font.displayFamily} · ${font.id.slice(-6)}` } : {}),
        aliases: [
          ...getFontFamilyAliases(option.value),
          ...(font ? getFontFamilyAliases(font.displayFamily) : []),
        ],
      };
    });
  });
  return { fontOptions, fontResourceRevision };
}
