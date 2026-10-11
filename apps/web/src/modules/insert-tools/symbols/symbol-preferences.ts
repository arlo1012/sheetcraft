import { readonly, shallowRef } from "vue";

/** Literal text remains literal; an omitted family inherits the insertion context. */
export type SymbolInsertion = Readonly<{ text: string; fontFamily?: string }>;
export type CustomSymbol = SymbolInsertion & Readonly<{ visible: boolean; shortcut?: string }>;
export type SymbolPreferences = Readonly<{
  version: 1;
  custom: readonly CustomSymbol[];
  recent: readonly SymbolInsertion[];
}>;
export const SYMBOL_PREFERENCES_KEY = "sheetcraft.symbols.v1";
export const SYMBOL_RECENT_LIMIT = 18;
export const SYMBOL_CUSTOM_LIMIT = 256;
export const SYMBOL_TEXT_LIMIT = 16;

// WPS Sheets 12.1.2.29182: exact scalar values and order, independently measured.
// Its per-entry default fonts were not verified, so defaults inherit the cell font.
const DEFAULT_CUSTOM = "＋－×÷㎏㎜㎝㎡ɑɡαβθ℃〖｛©®＠＆＊＃％‰＄￥§¦※◎≈…≤≥≦≧£RQ";
const DEFAULT_RECENT = "▲※■☆◆◎●√↑↓≤≥∷①②③";
export function defaultSymbolPreferences(): SymbolPreferences {
  return {
    version: 1,
    custom: [...DEFAULT_CUSTOM].map((text, index) => ({ text, visible: index < 36 })),
    recent: [...DEFAULT_RECENT].map((text) => ({ text })),
  };
}
export function symbolIdentity(symbol: SymbolInsertion): string {
  return JSON.stringify([symbol.text, symbol.fontFamily ?? ""]);
}
export function validSymbolInsertion(value: unknown): value is SymbolInsertion {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.text === "string" &&
    item.text.length > 0 &&
    [...item.text].length <= SYMBOL_TEXT_LIMIT &&
    [...item.text].every((character) => {
      const cp = character.codePointAt(0)!;
      return cp >= 32 && !(cp >= 127 && cp <= 159) && !(cp >= 0xd800 && cp <= 0xdfff);
    }) &&
    (item.fontFamily === undefined ||
      (typeof item.fontFamily === "string" &&
        item.fontFamily.length > 0 &&
        item.fontFamily.length <= 256 &&
        item.fontFamily.trim() === item.fontFamily))
  );
}
function cloneInsertion(item: SymbolInsertion): SymbolInsertion {
  return { text: item.text, ...(item.fontFamily ? { fontFamily: item.fontFamily } : {}) };
}
export function withRecentSymbol(
  prefs: SymbolPreferences,
  item: SymbolInsertion,
): SymbolPreferences {
  if (!validSymbolInsertion(item)) return prefs;
  return {
    ...prefs,
    recent: [
      cloneInsertion(item),
      ...prefs.recent.filter((old) => symbolIdentity(old) !== symbolIdentity(item)),
    ].slice(0, SYMBOL_RECENT_LIMIT),
  };
}
export function withCustomSymbol(
  prefs: SymbolPreferences,
  item: SymbolInsertion,
): SymbolPreferences {
  if (
    !validSymbolInsertion(item) ||
    prefs.custom.length >= SYMBOL_CUSTOM_LIMIT ||
    prefs.custom.some((old) => symbolIdentity(old) === symbolIdentity(item))
  )
    return prefs;
  return { ...prefs, custom: [{ ...cloneInsertion(item), visible: true }, ...prefs.custom] };
}
export function moveCustomSymbol(
  prefs: SymbolPreferences,
  index: number,
  delta: -1 | 1,
): SymbolPreferences {
  const target = index + delta;
  if (index < 0 || index >= prefs.custom.length || target < 0 || target >= prefs.custom.length)
    return prefs;
  const custom = [...prefs.custom];
  [custom[index], custom[target]] = [custom[target]!, custom[index]!];
  return { ...prefs, custom };
}

export type ShortcutIssue = "modifier" | "unsupported" | "reserved" | "duplicate";
export function captureSymbolShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): string | undefined {
  if (
    ["Control", "Meta", "Alt", "Shift", "AltGraph", "Dead", "Process", "Unidentified"].includes(
      event.key,
    )
  )
    return undefined;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [
    ...(event.ctrlKey ? ["Ctrl"] : []),
    ...(event.metaKey ? ["Meta"] : []),
    ...(event.altKey ? ["Alt"] : []),
    ...(event.shiftKey ? ["Shift"] : []),
    key,
  ].join("+");
}
export function validateSymbolShortcut(
  shortcut: string,
  custom: readonly CustomSymbol[],
  exceptIdentity?: string,
): ShortcutIssue | undefined {
  if (!/^(?:(?:Ctrl|Meta)\+|Alt\+)/.test(shortcut)) return "modifier";
  if (
    !/^(?:Ctrl\+)?(?:Meta\+)?(?:Alt\+)?(?:Shift\+)?(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(shortcut)
  )
    return "unsupported";
  // Browser/OS and spreadsheet command combinations are deliberately not overridden.
  const key = shortcut.split("+").at(-1)!;
  if (
    /^(?:Ctrl|Meta)\+[A-Z0-9]$/.test(shortcut) ||
    /^(?:Ctrl|Meta)\+Shift\+[A-Z0-9]$/.test(shortcut) ||
    /^Alt\+(?:F4|F10|[A-Z0-9])$/.test(shortcut) ||
    /^(?:Ctrl|Meta)\+(?:Shift\+)?(?:F2|F4|F5|F6|F12)$/.test(shortcut) ||
    key === "F1" ||
    key === "F2" ||
    shortcut.includes("Ctrl+Meta+") ||
    shortcut.includes("Ctrl+Alt+")
  )
    return "reserved";
  if (custom.some((item) => item.shortcut === shortcut && symbolIdentity(item) !== exceptIdentity))
    return "duplicate";
  return undefined;
}
/** Host may dispatch this only in its own current, editable session. Hidden entries remain eligible. */
export function resolveSymbolShortcut(
  prefs: SymbolPreferences,
  event: Parameters<typeof captureSymbolShortcut>[0],
): SymbolInsertion | undefined {
  const shortcut = captureSymbolShortcut(event);
  const item = prefs.custom.find((candidate) => candidate.shortcut === shortcut);
  return item && shortcut && !validateSymbolShortcut(shortcut, prefs.custom, symbolIdentity(item))
    ? cloneInsertion(item)
    : undefined;
}
export function parseSymbolPreferences(raw: string | null): SymbolPreferences {
  const fallback = defaultSymbolPreferences();
  if (!raw || raw.length > 200_000) return fallback;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1 || !Array.isArray(value.custom) || !Array.isArray(value.recent))
      return fallback;
    const seen = new Set<string>();
    const custom: CustomSymbol[] = [];
    for (const entry of value.custom.slice(0, SYMBOL_CUSTOM_LIMIT)) {
      if (
        !validSymbolInsertion(entry) ||
        typeof (entry as CustomSymbol).visible !== "boolean" ||
        seen.has(symbolIdentity(entry))
      )
        continue;
      seen.add(symbolIdentity(entry));
      const shortcut = (entry as CustomSymbol).shortcut;
      custom.push({
        ...cloneInsertion(entry),
        visible: (entry as CustomSymbol).visible,
        ...(typeof shortcut === "string" && !validateSymbolShortcut(shortcut, custom)
          ? { shortcut }
          : {}),
      });
    }
    const recent: SymbolInsertion[] = [];
    seen.clear();
    for (const entry of value.recent) {
      if (!validSymbolInsertion(entry) || seen.has(symbolIdentity(entry))) continue;
      seen.add(symbolIdentity(entry));
      recent.push(cloneInsertion(entry));
      if (recent.length === SYMBOL_RECENT_LIMIT) break;
    }
    return { version: 1, custom, recent };
  } catch {
    return fallback;
  }
}
const state = shallowRef<SymbolPreferences>(defaultSymbolPreferences());
const storageError = shallowRef(false);
let initialized = false;
export function useSymbolPreferences() {
  if (!initialized) {
    initialized = true;
    try {
      state.value = parseSymbolPreferences(
        globalThis.localStorage?.getItem(SYMBOL_PREFERENCES_KEY) ?? null,
      );
    } catch {
      storageError.value = true;
    }
  }
  function update(next: SymbolPreferences): void {
    state.value = next;
    try {
      globalThis.localStorage?.setItem(SYMBOL_PREFERENCES_KEY, JSON.stringify(next));
      storageError.value = false;
    } catch {
      storageError.value = true;
    }
  }
  return { preferences: readonly(state), storageError: readonly(storageError), update };
}
