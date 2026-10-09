import { pinyin } from "pinyin-pro";
import type { FilterValueOption } from "./filter-types";

export interface FilterSearchOptions {
  mode: "all" | "any" | "phrase";
  pinyin: boolean;
}

export const DEFAULT_FILTER_SEARCH_OPTIONS: FilterSearchOptions = {
  mode: "all",
  pinyin: true,
};

interface SearchableLabel {
  normalized: string;
  pinyin?: string;
  pinyinCompact?: string;
  initials?: string;
}

const MAX_CACHED_LABELS = 500;
const searchableLabels = new Map<string, SearchableLabel>();

function getSearchableLabel(label: string, includePinyin: boolean): SearchableLabel {
  let searchableLabel = searchableLabels.get(label);
  if (!searchableLabel) {
    searchableLabel = { normalized: label.toLocaleLowerCase() };
    if (searchableLabels.size >= MAX_CACHED_LABELS) searchableLabels.clear();
    searchableLabels.set(label, searchableLabel);
  }

  if (!includePinyin || searchableLabel.pinyin) return searchableLabel;

  const pinyinLabel = pinyin(label, { toneType: "none", nonZh: "consecutive" }).toLocaleLowerCase();
  searchableLabel.pinyin = pinyinLabel;
  searchableLabel.pinyinCompact = pinyinLabel.replaceAll(" ", "");
  searchableLabel.initials = pinyin(label, {
    pattern: "first",
    toneType: "none",
    nonZh: "consecutive",
  })
    .toLocaleLowerCase()
    .replaceAll(" ", "");

  return searchableLabel;
}

function matchesToken(label: SearchableLabel, token: string, includePinyin: boolean): boolean {
  return Boolean(
    label.normalized.includes(token) ||
    (includePinyin &&
      (label.pinyin?.includes(token) ||
        label.pinyinCompact?.includes(token.replaceAll(" ", "")) ||
        label.initials?.includes(token.replaceAll(" ", "")))),
  );
}

function matchesPhrase(label: SearchableLabel, phrase: string, includePinyin: boolean): boolean {
  return Boolean(
    label.normalized.includes(phrase) ||
    (includePinyin &&
      (label.pinyin?.includes(phrase) ||
        (!phrase.includes(" ") &&
          (label.pinyinCompact?.includes(phrase) || label.initials?.includes(phrase))))),
  );
}

/** Matches displayed filter values by keywords, literal phrase, and optional pinyin. */
export function getMatchingFilterValues<T extends FilterValueOption>(
  values: readonly T[],
  query: string,
  options: FilterSearchOptions = DEFAULT_FILTER_SEARCH_OPTIONS,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...values];

  if (options.mode === "phrase") {
    return values.filter((option) =>
      matchesPhrase(
        getSearchableLabel(option.label, options.pinyin),
        normalizedQuery,
        options.pinyin,
      ),
    );
  }

  const tokens = normalizedQuery.split(/\s+/);
  return values.filter((option) => {
    const label = getSearchableLabel(option.label, options.pinyin);
    return options.mode === "any"
      ? tokens.some((token) => matchesToken(label, token, options.pinyin))
      : tokens.every((token) => matchesToken(label, token, options.pinyin));
  });
}
