import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useAppI18n } from "../i18n";
import { createFontFamilyOptions } from "./font-catalog";
import { localFontAccess } from "./local-fonts";

export function useFontCatalog(current: MaybeRefOrGetter<readonly string[]> = []) {
  const { locale } = useAppI18n();
  const fontOptions = computed(() =>
    createFontFamilyOptions(locale.value, [...toValue(current), ...localFontAccess.families.value]),
  );
  return { fontOptions };
}
