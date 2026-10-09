import { ref, watch, type Ref } from "vue";

export type StatusBarNumberFormat = "chinese-unit" | "thousands" | "ten-thousands" | "none";

export type StatusBarSettings = {
  average: boolean;
  count: boolean;
  maximum: boolean;
  minimum: boolean;
  numberFormat: StatusBarNumberFormat;
  numericCount: boolean;
  sum: boolean;
};

export const STATUS_BAR_SETTINGS_STORAGE_KEY = "sheetcraft.status-bar.settings";

const DEFAULT_SETTINGS: StatusBarSettings = {
  average: true,
  count: true,
  maximum: false,
  minimum: false,
  numberFormat: "chinese-unit",
  numericCount: false,
  sum: true,
};

function isSettings(value: unknown): value is Partial<StatusBarSettings> {
  return typeof value === "object" && value !== null;
}

function resolveStoredSettings(): StatusBarSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const stored = JSON.parse(localStorage.getItem(STATUS_BAR_SETTINGS_STORAGE_KEY) ?? "null");
    if (!isSettings(stored)) return { ...DEFAULT_SETTINGS };
    return {
      average: typeof stored.average === "boolean" ? stored.average : DEFAULT_SETTINGS.average,
      count: typeof stored.count === "boolean" ? stored.count : DEFAULT_SETTINGS.count,
      maximum: typeof stored.maximum === "boolean" ? stored.maximum : DEFAULT_SETTINGS.maximum,
      minimum: typeof stored.minimum === "boolean" ? stored.minimum : DEFAULT_SETTINGS.minimum,
      numberFormat:
        stored.numberFormat === "chinese-unit" ||
        stored.numberFormat === "thousands" ||
        stored.numberFormat === "ten-thousands" ||
        stored.numberFormat === "none"
          ? stored.numberFormat
          : DEFAULT_SETTINGS.numberFormat,
      numericCount:
        typeof stored.numericCount === "boolean"
          ? stored.numericCount
          : DEFAULT_SETTINGS.numericCount,
      sum: typeof stored.sum === "boolean" ? stored.sum : DEFAULT_SETTINGS.sum,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function useStatusBarSettings(): Ref<StatusBarSettings> {
  const settings = ref(resolveStoredSettings());
  watch(
    settings,
    (value) => {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(STATUS_BAR_SETTINGS_STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Storage can be unavailable in embedded or privacy-restricted hosts.
      }
    },
    { deep: true },
  );
  return settings;
}
