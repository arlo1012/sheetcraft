import type { DataToolFilterValueOption } from "./data-tools-types";

/** Matches every whitespace-separated search token against a displayed filter value. */
export function getMatchingFilterValues(
  values: readonly DataToolFilterValueOption[],
  query: string,
): DataToolFilterValueOption[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [...values];
  return values.filter((option) => {
    const label = option.label.toLocaleLowerCase();
    return tokens.every((token) => label.includes(token));
  });
}
