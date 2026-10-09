import { createI18n, useI18n } from "vue-i18n";
import { enUS } from "./messages/en-US";
import { zhCN } from "./messages/zh-CN";
import type { AppLocale, MessageKey, MessageParams, MessageSchema } from "./schema";

export type { AppLocale, MessageKey, MessageParams, MessageSchema } from "./schema";

export const APP_LOCALE_STORAGE_KEY = "sheetcraft.locale";
export const APP_LOCALES = ["zh-CN", "en-US"] as const;

export function isAppLocale(locale: string | null | undefined): locale is AppLocale {
  return APP_LOCALES.includes(locale as AppLocale);
}

function mapBrowserLocale(locale: string): AppLocale | undefined {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }
  if (normalized.startsWith("en")) {
    return "en-US";
  }
  return undefined;
}

export function resolveInitialLocale(options?: {
  storedLocale?: string | null;
  browserLocales?: readonly string[];
}): AppLocale {
  let storedLocale = options?.storedLocale;
  if (storedLocale === undefined && typeof localStorage !== "undefined") {
    try {
      storedLocale = localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    } catch {
      storedLocale = null;
    }
  }
  if (isAppLocale(storedLocale)) {
    return storedLocale;
  }

  const browserLocales =
    options?.browserLocales ??
    (typeof navigator === "undefined"
      ? []
      : navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]);
  for (const locale of browserLocales) {
    const mappedLocale = mapBrowserLocale(locale);
    if (mappedLocale) {
      return mappedLocale;
    }
  }
  return "en-US";
}

function syncDocumentLocale(locale: AppLocale): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export function createAppI18n(locale = resolveInitialLocale()) {
  syncDocumentLocale(locale);
  return createI18n<[MessageSchema], AppLocale>({
    legacy: false,
    locale,
    fallbackLocale: "en-US",
    flatJson: true,
    messages: {
      "zh-CN": structuredClone(zhCN),
      "en-US": structuredClone(enUS),
    },
  });
}

export function useAppI18n() {
  const composer = useI18n({ useScope: "global" });
  const t = (key: MessageKey, params?: MessageParams): string =>
    params ? composer.t(key, params) : composer.t(key);
  const setLocale = (locale: AppLocale): void => {
    composer.locale.value = locale;
    syncDocumentLocale(locale);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
      } catch {
        // Storage can be unavailable in embedded or privacy-restricted hosts.
      }
    }
  };
  return { locale: composer.locale, setLocale, t };
}
