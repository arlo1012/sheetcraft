import { formatCellNumberValue, getNumberFormatLocaleId } from "@sheetcraft/core/number-format";

export type DateFormatPreset = Readonly<{
  id: string;
  code: string;
  label: string;
  /** Semantic format ids merged into this locale's identical Excel code. */
  aliasIds?: readonly string[];
}>;

type DateField = "numeric" | "2-digit" | "short" | "long";
type DateFields = Readonly<{
  year?: Exclude<DateField, "short" | "long">;
  month?: DateField;
  day?: Exclude<DateField, "short" | "long">;
  weekday?: "short" | "long";
  hour?: Exclude<DateField, "short" | "long">;
  minute?: Exclude<DateField, "short" | "long">;
  second?: Exclude<DateField, "short" | "long">;
  hourCycle?: "h12" | "h23";
}>;

type DatePresetDefinition = Readonly<{ id: string; fields: DateFields }>;

const SAMPLE_DATE = new Date(Date.UTC(2012, 2, 14, 13, 30, 55));

// These ids represent the meaning of a row rather than its locale-specific
// code. The panel can therefore retain the selected format when a user changes
// the region and only replace its ordering, separators and LCID.
const DATE_PRESET_DEFINITIONS: readonly DatePresetDefinition[] = [
  { id: "date-short", fields: { year: "numeric", month: "numeric", day: "numeric" } },
  { id: "date-short-padded", fields: { year: "numeric", month: "2-digit", day: "2-digit" } },
  {
    id: "date-short-two-digit-year",
    fields: { year: "2-digit", month: "numeric", day: "numeric" },
  },
  { id: "date-medium", fields: { year: "numeric", month: "short", day: "numeric" } },
  { id: "date-long", fields: { year: "numeric", month: "long", day: "numeric" } },
  {
    id: "date-full",
    fields: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  },
  { id: "date-year-month", fields: { year: "numeric", month: "long" } },
  { id: "date-year-month-short", fields: { year: "numeric", month: "short" } },
  { id: "date-year-month-numeric", fields: { year: "numeric", month: "numeric" } },
  { id: "date-month-day", fields: { month: "long", day: "numeric" } },
  { id: "date-month-day-short", fields: { month: "short", day: "numeric" } },
  { id: "date-month-day-numeric", fields: { month: "numeric", day: "numeric" } },
  { id: "date-weekday-long", fields: { weekday: "long" } },
  { id: "date-weekday-short", fields: { weekday: "short" } },
  {
    id: "date-weekday-short-date",
    fields: { weekday: "short", year: "numeric", month: "numeric", day: "numeric" },
  },
  {
    id: "date-time-minutes",
    fields: {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  },
  {
    id: "date-time-seconds",
    fields: {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    },
  },
  {
    id: "date-time-am-pm",
    fields: {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h12",
    },
  },
];

const CHINESE_LEGACY_CODES: readonly Readonly<{ id: string; code: string }>[] = [
  { id: "date-short", code: "yyyy/m/d" },
  { id: "date-long", code: 'yyyy"年"m"月"d"日"' },
  { id: "date-iso", code: "yyyy-mm-dd" },
  { id: "date-native-full", code: '[DBNum1]yyyy"年"m"月"d"日"' },
  { id: "date-native-year-month", code: '[DBNum1]yyyy"年"m"月"' },
  { id: "date-native-month-day", code: '[DBNum1]m"月"d"日"' },
  { id: "date-year-month", code: 'yyyy"年"m"月"' },
  { id: "date-month-day", code: 'm"月"d"日"' },
  { id: "date-weekday-long", code: "aaaa" },
  { id: "date-weekday-short", code: "aaa" },
];

// Keep the three distinct legacy English rows that are not otherwise covered
// by the locale-derived families. Existing documents continue to have the
// familiar Excel spellings available when their region is en-US.
const ENGLISH_LEGACY_CODES: readonly Readonly<{ id: string; code: string }>[] = [
  { id: "date-legacy-day-short-month-two-digit-year", code: "d-mmm-yy" },
  { id: "date-legacy-day-short-month", code: "d-mmm" },
  { id: "date-legacy-short-month-two-digit-year", code: "mmm-yy" },
];

/**
 * Whether this runtime can actually create a date formatter for the locale.
 * `Intl.DateTimeFormat` otherwise silently falls back to its default locale.
 */
export function supportsDateFormatLocale(locale: string): boolean {
  const canonical = canonicalDateLocale(locale);
  if (!canonical) return false;
  try {
    if (!Intl.DateTimeFormat.supportedLocalesOf([canonical], { localeMatcher: "lookup" }).length)
      return false;
    const requested = new Intl.Locale(canonical);
    if (!requested.script) return true;
    const resolved = new Intl.DateTimeFormat(canonical, {
      localeMatcher: "lookup",
    }).resolvedOptions().locale;
    return new Intl.Locale(resolved).maximize().script === requested.script;
  } catch {
    return false;
  }
}

export function getDateFormatPresets(region: string): DateFormatPreset[] {
  const locale = canonicalDateLocale(region) ?? "en-US";
  const lcid = getNumberFormatLocaleId(region) ?? getNumberFormatLocaleId(locale);
  const dynamic = DATE_PRESET_DEFINITIONS.map((definition) => {
    const formatter = createFormatter(locale, definition.fields);
    const code = withLocalePrefix(toExcelDateCode(formatter, definition.fields), lcid);
    return {
      id: definition.id,
      code,
      label: dynamicLabel(code, locale, definition.fields.hour ? 40982.56313657407 : 40982),
    };
  });

  const iso = {
    id: "date-iso",
    code: withLocalePrefix("yyyy-mm-dd", lcid),
    label: dynamicLabel(withLocalePrefix("yyyy-mm-dd", lcid), locale),
  };
  if (!locale.toLowerCase().startsWith("zh")) {
    const englishLegacy =
      locale.toLowerCase() === "en-us" ? legacyPresets(ENGLISH_LEGACY_CODES, lcid, locale) : [];
    return dedupeDatePresets([...dynamic, iso, ...englishLegacy]);
  }

  const legacy = legacyPresets(CHINESE_LEGACY_CODES, lcid, locale);
  const legacyIds = new Set(legacy.map(({ id }) => id));
  return dedupeDatePresets([...legacy, ...dynamic.filter(({ id }) => !legacyIds.has(id))]);
}

function canonicalDateLocale(locale: string): string | undefined {
  if (typeof locale !== "string" || !locale.trim()) return undefined;
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    return undefined;
  }
}

function createFormatter(locale: string, fields: DateFields): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    ...fields,
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "UTC",
    ...(fields.hour ? { hourCycle: fields.hourCycle ?? "h23" } : {}),
  });
}

function toExcelDateCode(formatter: Intl.DateTimeFormat, fields: DateFields): string {
  const resolved = formatter.resolvedOptions();
  const resolvedFields: DateFields = {
    ...fields,
    ...(resolved.year ? { year: resolved.year as DateFields["year"] } : {}),
    ...(resolved.month ? { month: resolved.month as DateFields["month"] } : {}),
    ...(resolved.day ? { day: resolved.day as DateFields["day"] } : {}),
    ...(resolved.weekday ? { weekday: resolved.weekday as DateFields["weekday"] } : {}),
    ...(resolved.hour ? { hour: resolved.hour as DateFields["hour"] } : {}),
    ...(resolved.minute ? { minute: resolved.minute as DateFields["minute"] } : {}),
    ...(resolved.second ? { second: resolved.second as DateFields["second"] } : {}),
  };
  const parts = formatter.formatToParts(SAMPLE_DATE);
  const code = parts.map((part) => excelDatePart(part, resolvedFields)).join("");
  // A few ICU locale records honor h12 while omitting a dayPeriod part. Keep
  // the distinct 12-hour choice meaningful; otherwise it will dedupe with
  // the 24-hour row below.
  if (resolved.hourCycle === "h12" && !parts.some((part) => part.type === "dayPeriod"))
    return `${code}" "AM/PM`;
  return code;
}

function excelDatePart(part: Intl.DateTimeFormatPart, fields: DateFields): string {
  switch (part.type) {
    case "year":
      return fields.year === "2-digit" ? "yy" : "yyyy";
    case "month":
      return fields.month === "2-digit"
        ? "mm"
        : fields.month === "numeric"
          ? "m"
          : fields.month === "short"
            ? "mmm"
            : "mmmm";
    case "day":
      return fields.day === "2-digit" ? "dd" : "d";
    case "weekday":
      return fields.weekday === "short" ? "ddd" : "dddd";
    case "hour":
      return fields.hour === "2-digit" ? "hh" : "h";
    case "minute":
      return fields.minute === "numeric" ? "m" : "mm";
    case "second":
      return fields.second === "numeric" ? "s" : "ss";
    case "dayPeriod":
      return "AM/PM";
    default:
      return quoteLiteral(part.value);
  }
}

function quoteLiteral(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function legacyLabel(code: string, locale: string): string {
  return dynamicLabel(code, locale);
}

function legacyPresets(
  definitions: readonly Readonly<{ id: string; code: string }>[],
  lcid: string | undefined,
  locale: string,
): DateFormatPreset[] {
  return definitions.map(({ id, code }) => {
    const localizedCode = withLocalePrefix(code, lcid);
    return { id, code: localizedCode, label: legacyLabel(localizedCode, locale) };
  });
}

function dedupeDatePresets(presets: readonly DateFormatPreset[]): DateFormatPreset[] {
  const byCode = new Map<string, DateFormatPreset>();
  for (const preset of presets) {
    const existing = byCode.get(preset.code);
    if (!existing) {
      byCode.set(preset.code, preset);
      continue;
    }
    const aliasIds = [
      ...new Set([...(existing.aliasIds ?? []), preset.id, ...(preset.aliasIds ?? [])]),
    ];
    byCode.set(preset.code, { ...existing, aliasIds });
  }
  return [...byCode.values()];
}

function dynamicLabel(code: string, locale: string, value = 40982): string {
  try {
    return formatCellNumberValue(value, { kind: "date", code, locale }).text;
  } catch {
    return code;
  }
}

function withLocalePrefix(code: string, lcid: string | undefined): string {
  return lcid ? `[$-${lcid}]${code}` : code;
}
