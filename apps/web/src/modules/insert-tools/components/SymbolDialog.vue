<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import { Tabs, TabPanel } from "tdesign-vue-next/es/tabs";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { PrimaryTable } from "tdesign-vue-next/es/table";
import type {
  PrimaryTableCol,
  RowEventContext,
  TableRowAttributes,
  TableRowData,
} from "tdesign-vue-next/es/table/type";
import OptionList from "../../../shared/option-list/OptionList.vue";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import SymbolCharacterGrid from "./SymbolCharacterGrid.vue";
import SymbolFontSourceControls from "./SymbolFontSourceControls.vue";
import {
  fontHasCodePoint,
  loadSymbolUnicodeCatalog,
  symbolCharacterCode,
  type SymbolUnicodeCatalog,
} from "../symbols/unicode-catalog";
import {
  filterSymbolPoints,
  parseDialogCode,
  SPECIAL_SYMBOLS,
  type SymbolCodeFormat,
} from "../symbols/symbol-dialog-model";
import {
  captureSymbolShortcut,
  defaultSymbolPreferences,
  moveCustomSymbol,
  SYMBOL_CUSTOM_LIMIT,
  symbolIdentity,
  useSymbolPreferences,
  validSymbolInsertion,
  validateSymbolShortcut,
  withCustomSymbol,
  withRecentSymbol,
  type SymbolInsertion,
} from "../symbols/symbol-preferences";
import type { SymbolFont } from "../symbols/symbol-fonts";
import {
  parseSymbolViewPreferences,
  SYMBOL_VIEW_PREFERENCES_KEY,
  type SymbolViewPreferences,
} from "../symbols/symbol-view-preferences";
import { symbolUnicodeBlockLabel } from "../symbols/unicode-block-labels.zh-CN";
import type {
  LocalSymbolFont,
  LocalSymbolFontErrorCode,
} from "../../../shared/cell-text/local-font-source";
const props = defineProps<{
  disabled: boolean;
  editSessionId?: string;
  defaultFontFamily?: string;
  insertText?: (payload: SymbolInsertion) => boolean;
}>();
const emit = defineEmits<{ insert: [symbol: SymbolInsertion]; close: [] }>();
const { t, locale } = useAppI18n();
const { preferences, storageError, update } = useSymbolPreferences();
const tab = ref("symbols");
const catalog = shallowRef<SymbolUnicodeCatalog>();
const fonts = shallowRef<readonly SymbolFont[]>([]);
const fontRestoreError = ref<LocalSymbolFontErrorCode>();
const localFontLabels = shallowRef<Record<string, string>>({});
const viewStorageError = ref(false);
const savedView = shallowRef<SymbolViewPreferences>();
try {
  savedView.value = parseSymbolViewPreferences(
    globalThis.localStorage?.getItem(SYMBOL_VIEW_PREFERENCES_KEY) ?? null,
  );
} catch {
  viewStorageError.value = true;
}
const fontId = ref(
  savedView.value?.fontId ?? (props.defaultFontFamily ? "normal-text" : "noto-sans"),
);
const font = computed(() => {
  if (fontId.value !== "normal-text") return fonts.value.find((entry) => entry.id === fontId.value);
  const family = props.defaultFontFamily?.toLocaleLowerCase("en-US");
  // A same-name file is not proof of the browser's current CSS face.
  return fonts.value.find((entry) => entry.family.toLocaleLowerCase("en-US") === family);
});
const coverageUnknown = computed(() => !font.value);
const unverifiedFontLabel = computed(() =>
  fontId.value === "normal-text"
    ? (props.defaultFontFamily ?? t("symbolTools.normalText"))
    : (savedView.value?.label ?? savedView.value?.family ?? fontId.value),
);
const fontStates = shallowRef<Record<string, "loading" | "ready" | "error">>({});
const fontRequests = new Map<string, Promise<boolean>>();
const loading = ref(true);
const loadError = ref(false);
const allUnicode = ref(false);
const query = ref("");
const subset = ref("");
const codeFormat = ref<SymbolCodeFormat>("unicode-hex");
const codeInput = ref("0020");
const invalidCode = ref(false);
const selected = ref<number | undefined>(32);
const specialIndex = ref(0);
const customIndex = ref(0);
const literal = ref("");
const literalActive = ref(false);
const selectionOverride = shallowRef<SymbolInsertion>();
const inserted = ref(false);
const resetVisible = ref(false);
const shortcutInput = ref("");
const shortcutMessage = ref<MessageKey>();
const localRecent = ref<readonly SymbolInsertion[]>(
  preferences.value.recent.map((item) => ({ ...item })),
);
let mounted = true;
async function loadFont(family = font.value?.family): Promise<boolean> {
  if (!family) return false;
  if (fontStates.value[family] === "ready") return true;
  const pending = fontRequests.get(family);
  if (pending) return pending;
  fontStates.value = { ...fontStates.value, [family]: "loading" };
  const request = (async () => {
    await (await import("../../../shared/cell-text/font-resources")).retryCellFontResource(family);
    if (!fonts.value.some((entry) => entry.family === family && entry.source === "bundled")) {
      const local = await import("../../../shared/cell-text/local-font-source");
      const found = await local.ensureLocalSymbolFont(family);
      if (!found) throw new Error("Local font is unavailable");
      registerLocalFont(found, false);
    }
  })()
    .then(
      () => {
        if (mounted) fontStates.value = { ...fontStates.value, [family]: "ready" };
        return true;
      },
      () => {
        if (mounted) fontStates.value = { ...fontStates.value, [family]: "error" };
        return false;
      },
    )
    .finally(() => {
      fontRequests.delete(family);
    });
  fontRequests.set(family, request);
  return request;
}
async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const [data, resources] = await Promise.all([
      loadSymbolUnicodeCatalog(),
      import("../symbols/symbol-fonts"),
    ]);
    if (!mounted) return;
    catalog.value = data;
    fonts.value = [
      ...resources.BUNDLED_SYMBOL_FONTS,
      ...fonts.value.filter((entry) => entry.source === "local"),
    ];
    try {
      const local = await import("../../../shared/cell-text/local-font-source");
      if (!mounted) return;
      for (const entry of local.useLocalSymbolFonts().fonts.value) registerLocalFont(entry, false);
      const restoreFamily = savedView.value?.family ?? props.defaultFontFamily;
      if (restoreFamily?.startsWith("SheetcraftLocal_")) {
        const restored = await local.ensureLocalSymbolFont(restoreFamily);
        if (mounted && restored) registerLocalFont(restored, false);
      }
    } catch (error) {
      if (mounted) {
        fontRestoreError.value =
          error && typeof error === "object" && "code" in error
            ? (error.code as LocalSymbolFontErrorCode)
            : "malformed";
      }
    }
    // Only an untouched first view chooses a verified face. Explicit choices stay explicit,
    // including unavailable Normal text or a local face that could not be restored.
    if (!savedView.value && !font.value) fontId.value = "noto-sans";
    await loadFont();
  } catch {
    if (mounted) loadError.value = true;
  } finally {
    if (mounted) loading.value = false;
  }
}
onMounted(() => void load());
onBeforeUnmount(() => {
  mounted = false;
});
const points = computed(() =>
  catalog.value && (allUnicode.value || font.value)
    ? catalog.value.codePoints(allUnicode.value ? undefined : font.value!.ranges)
    : new Uint32Array(),
);
const subsets = computed(() => catalog.value?.subsets(points.value) ?? []);
const filtered = computed(() =>
  catalog.value
    ? filterSymbolPoints(catalog.value, points.value, query.value, codeFormat.value, locale.value)
    : new Uint32Array(),
);
const customEntry = computed(() => preferences.value.custom[customIndex.value]);
function selectedFamily(text: string): string | undefined {
  if (fontId.value === "normal-text") return undefined;
  return font.value &&
    [...text].every((char) => fontHasCodePoint(font.value!.ranges, char.codePointAt(0)!))
    ? font.value.family
    : undefined;
}
const current = computed<SymbolInsertion | undefined>(() => {
  if (tab.value === "custom") return customEntry.value;
  if (literalActive.value && tab.value === "symbols")
    return validSymbolInsertion({ text: literal.value }) ? { text: literal.value } : undefined;
  if (tab.value === "special") {
    const text = SPECIAL_SYMBOLS[specialIndex.value]?.text;
    return text
      ? { text, ...(selectedFamily(text) ? { fontFamily: selectedFamily(text) } : {}) }
      : undefined;
  }
  if (selectionOverride.value) return selectionOverride.value;
  if (invalidCode.value || selected.value === undefined || !filtered.value.includes(selected.value))
    return undefined;
  const text = String.fromCodePoint(selected.value);
  return { text, ...(selectedFamily(text) ? { fontFamily: selectedFamily(text) } : {}) };
});
watch(
  () => current.value?.fontFamily,
  (family) => {
    if (family) void loadFont(family);
  },
  { immediate: true },
);
const displayFontFamily = computed(
  () =>
    current.value?.fontFamily ??
    (tab.value === "symbols" && !literalActive.value && !selectionOverride.value
      ? font.value?.family
      : undefined),
);
const displayFontStatus = computed(() =>
  displayFontFamily.value ? (fontStates.value[displayFontFamily.value] ?? "loading") : "ready",
);
const canInsert = computed(
  () =>
    !props.disabled &&
    !!current.value &&
    (!displayFontFamily.value || fontStates.value[displayFontFamily.value] === "ready"),
);
function retryFont(): void {
  void loadFont(displayFontFamily.value);
}
const previewFontFamily = computed(() => current.value?.fontFamily ?? props.defaultFontFamily);
const currentCode = computed(() =>
  current.value
    ? [...current.value.text].map((ch) => `U+${symbolCharacterCode(ch.codePointAt(0)!)}`).join(" ")
    : "",
);
const currentName = computed(() =>
  current.value
    ? [...current.value.text]
        .map(
          (ch) =>
            catalog.value?.character(ch.codePointAt(0)!)?.name ?? t("symbolTools.unknownName"),
        )
        .join(" · ")
    : "",
);
const currentAliases = computed(() =>
  current.value
    ? [
        ...new Set(
          [...current.value.text].flatMap(
            (ch) =>
              catalog.value?.character(ch.codePointAt(0)!)?.aliases.map((alias) => alias.name) ??
              [],
          ),
        ),
      ].join(" · ")
    : "",
);
const currentMetadata = computed(() => {
  if (!current.value || [...current.value.text].length !== 1) return "";
  const character = catalog.value?.character(current.value.text.codePointAt(0)!);
  return character
    ? [
        character.block ? symbolUnicodeBlockLabel(character.block[2], locale.value) : undefined,
        character.category,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
});
const alreadyCustom = computed(
  () =>
    !!current.value &&
    preferences.value.custom.some(
      (entry) => symbolIdentity(entry) === symbolIdentity(current.value!),
    ),
);
const fontOptions = computed(() => [
  ...(props.defaultFontFamily || fontId.value === "normal-text"
    ? [
        {
          label: props.defaultFontFamily
            ? `${t("symbolTools.normalText")} (${localFontLabels.value[props.defaultFontFamily] ?? props.defaultFontFamily})`
            : t("symbolTools.normalText"),
          value: "normal-text",
        },
      ]
    : []),
  ...(savedView.value?.family && !fonts.value.some((item) => item.id === savedView.value?.fontId)
    ? [{ label: savedView.value.label ?? savedView.value.family, value: savedView.value.fontId }]
    : []),
  ...fonts.value.map((item) => ({
    label: localFontLabels.value[item.family]
      ? `${localFontLabels.value[item.family]} · ${item.id.slice(-6)}`
      : item.family,
    value: item.id,
  })),
]);
const subsetOptions = computed(() => [
  { label: t("symbolTools.allSubsets"), value: "" },
  ...subsets.value.map((item) => ({
    label: `${symbolUnicodeBlockLabel(item.name, locale.value)} (${item.count})`,
    value: item.name,
  })),
]);
const formatOptions = computed(() => [
  { label: t("symbolTools.unicodeHex"), value: "unicode-hex" },
  { label: t("symbolTools.latinDecimal"), value: "latin1-decimal" },
  { label: t("symbolTools.latinHex"), value: "latin1-hex" },
]);
function rememberFontChoice(): void {
  const choice = font.value;
  savedView.value = {
    version: 1,
    fontId: fontId.value,
    ...(choice?.source === "local"
      ? { family: choice.family, label: localFontLabels.value[choice.family] ?? choice.family }
      : savedView.value?.fontId === fontId.value && savedView.value.family
        ? {
            family: savedView.value.family,
            ...(savedView.value.label ? { label: savedView.value.label } : {}),
          }
        : {}),
  };
  try {
    globalThis.localStorage?.setItem(SYMBOL_VIEW_PREFERENCES_KEY, JSON.stringify(savedView.value));
    viewStorageError.value = false;
  } catch {
    viewStorageError.value = true;
  }
}
function chooseFont(value: unknown): void {
  fontId.value = String(value);
  rememberFontChoice();
}
function registerLocalFont(item: LocalSymbolFont, select = true): void {
  const entry: SymbolFont = {
    id: `local:${item.id}`,
    family: item.family,
    source: "local",
    ranges: item.ranges,
  };
  fonts.value = [...fonts.value.filter((old) => old.id !== entry.id), entry];
  localFontLabels.value = { ...localFontLabels.value, [item.family]: item.displayFamily };
  fontStates.value = { ...fontStates.value, [item.family]: "ready" };
  if (select) {
    fontId.value = entry.id;
    tab.value = "symbols";
    allUnicode.value = false;
    rememberFontChoice();
  }
}
function selectPoint(cp: number): void {
  selectionOverride.value = undefined;
  selected.value = cp;
  invalidCode.value = false;
  literalActive.value = false;
  codeInput.value = symbolCharacterCode(
    cp,
    codeFormat.value === "latin1-decimal" ? "decimal" : "hex",
  );
  subset.value = catalog.value?.character(cp)?.block?.[2] ?? "";
}
watch(fontId, () => {
  void loadFont();
});
watch([points, codeFormat], () => {
  if (selected.value === undefined || !filtered.value.includes(selected.value)) {
    selected.value = filtered.value[0];
    if (selected.value !== undefined) selectPoint(selected.value);
  } else selectPoint(selected.value);
});
watch(codeFormat, () => {
  if (selected.value !== undefined)
    codeInput.value = symbolCharacterCode(
      selected.value,
      codeFormat.value === "latin1-decimal" ? "decimal" : "hex",
    );
});
watch(query, () => {
  selectionOverride.value = undefined;
  invalidCode.value = false;
  literalActive.value = false;
  if (filtered.value.length && !filtered.value.includes(selected.value ?? -1))
    selectPoint(filtered.value[0]!);
});
watch(
  () =>
    [
      customEntry.value ? symbolIdentity(customEntry.value) : undefined,
      customEntry.value?.shortcut,
    ] as const,
  ([identity, shortcut], previous) => {
    shortcutInput.value = shortcut ?? "";
    if (identity !== previous?.[0]) shortcutMessage.value = undefined;
  },
  { immediate: true },
);
function navigateCode(value: string): void {
  selectionOverride.value = undefined;
  codeInput.value = value;
  literalActive.value = false;
  const cp = parseDialogCode(value, codeFormat.value);
  if (cp === undefined || !points.value.includes(cp)) {
    invalidCode.value = true;
    selected.value = undefined;
    return;
  }
  query.value = "";
  selectPoint(cp);
}
function changeSubset(value: unknown): void {
  subset.value = String(value);
  query.value = "";
  const entry = subsets.value.find((item) => item.name === value);
  const cp = entry
    ? points.value.find((point) => point >= entry.start && point <= entry.end)
    : points.value[0];
  if (cp !== undefined) selectPoint(cp);
}
async function submitInsertion(item: SymbolInsertion): Promise<void> {
  const handler = props.insertText;
  const ownerId = props.editSessionId;
  if (!mounted || props.disabled || !validSymbolInsertion(item)) return;
  if (item.fontFamily && fontStates.value[item.fontFamily] !== "ready") {
    if (!(await loadFont(item.fontFamily)) || !mounted || props.disabled) return;
  }
  if (!mounted || handler !== props.insertText || ownerId !== props.editSessionId) return;
  if (handler) {
    if (!handler(item)) return;
  } else emit("insert", item);
  inserted.value = true;
  localRecent.value = withRecentSymbol(
    { ...preferences.value, recent: localRecent.value },
    item,
  ).recent;
}
async function insert(): Promise<void> {
  if (!canInsert.value || !current.value) return;
  await submitInsertion({
    text: current.value.text,
    ...(current.value.fontFamily ? { fontFamily: current.value.fontFamily } : {}),
  });
}
function close(context?: { trigger?: string }): void {
  if (resetVisible.value) return;
  // WPS keeps insertion in the draft on Escape, but only explicit Close publishes MRU.
  if (context?.trigger !== "esc") update({ ...preferences.value, recent: localRecent.value });
  emit("close");
}
function addCustom(): void {
  if (current.value) update(withCustomSymbol(preferences.value, current.value));
}
async function pickRecent(item: SymbolInsertion, insertNow = false): Promise<void> {
  const handler = props.insertText;
  const ownerId = props.editSessionId;
  literalActive.value = false;
  invalidCode.value = false;
  query.value = "";
  const match = fonts.value.find((entry) => entry.family === item.fontFamily);
  if (match) fontId.value = match.id;
  const cp = item.text.codePointAt(0)!;
  if ([...item.text].length === 1 && (!item.fontFamily || match)) {
    if (!font.value || !fontHasCodePoint(font.value.ranges, cp)) allUnicode.value = true;
    codeFormat.value = "unicode-hex";
    selectPoint(cp);
  } else {
    literal.value = item.text;
    literalActive.value = true;
  }
  await nextTick();
  selectionOverride.value = {
    text: item.text,
    ...(item.fontFamily ? { fontFamily: item.fontFamily } : {}),
  };
  literalActive.value = false;
  if (item.fontFamily && !(await loadFont(item.fontFamily))) return;
  if (mounted && insertNow && handler === props.insertText && ownerId === props.editSessionId)
    await submitInsertion({
      text: item.text,
      ...(item.fontFamily ? { fontFamily: item.fontFamily } : {}),
    });
}
function toggleVisible(index: number, visible: boolean): void {
  update({
    ...preferences.value,
    custom: preferences.value.custom.map((entry, at) =>
      at === index ? { ...entry, visible } : entry,
    ),
  });
}
function move(delta: -1 | 1): void {
  const next = moveCustomSymbol(preferences.value, customIndex.value, delta);
  if (next !== preferences.value) {
    update(next);
    customIndex.value += delta;
  }
}
function removeCustom(): void {
  update({
    ...preferences.value,
    custom: preferences.value.custom.filter((_, index) => index !== customIndex.value),
  });
  customIndex.value = Math.max(0, Math.min(customIndex.value, preferences.value.custom.length - 1));
  shortcutInput.value = customEntry.value?.shortcut ?? "";
}
function captureShortcut(event: KeyboardEvent): void {
  if (event.key === "Tab") return;
  event.preventDefault();
  event.stopPropagation();
  const value = captureSymbolShortcut(event);
  if (value) {
    shortcutInput.value = value;
    shortcutMessage.value = undefined;
  }
}
function assignShortcut(clear = false): void {
  const entry = customEntry.value;
  if (!entry) return;
  const issue = clear
    ? undefined
    : validateSymbolShortcut(shortcutInput.value, preferences.value.custom, symbolIdentity(entry));
  const errors = {
    modifier: "symbolTools.shortcutModifier",
    unsupported: "symbolTools.shortcutUnsupported",
    reserved: "symbolTools.shortcutReserved",
    duplicate: "symbolTools.shortcutDuplicate",
  } as const;
  if (issue) {
    shortcutMessage.value = errors[issue];
    return;
  }
  update({
    ...preferences.value,
    custom: preferences.value.custom.map((item, index) => {
      if (index !== customIndex.value) return item;
      const { shortcut: _shortcut, ...rest } = item;
      return clear ? rest : { ...rest, shortcut: shortcutInput.value };
    }),
  });
  if (clear) shortcutInput.value = "";
  shortcutMessage.value = "symbolTools.shortcutSaved";
}
function reset(): void {
  update({ ...preferences.value, custom: defaultSymbolPreferences().custom });
  customIndex.value = 0;
  shortcutInput.value = "";
  resetVisible.value = false;
}
const specialOptions = computed(() =>
  SPECIAL_SYMBOLS.map((entry, index) => ({
    value: String(index),
    label: t(`symbolTools.${entry.label}`),
    text: entry.text,
  })),
);
function selectSpecial(value: string): void {
  specialIndex.value = Number(value);
}
function activateSpecial(value: string): void {
  selectSpecial(value);
  void insert();
}
const customRows = computed(() =>
  preferences.value.custom.map((entry, index) => ({ index, entry })),
);
const customColumns = computed<PrimaryTableCol[]>(() => [
  { colKey: "symbol", title: t("symbolTools.custom"), width: "50%" },
  { colKey: "shortcut", title: t("symbolTools.shortcut"), width: "50%" },
]);
const customRowAttributes: TableRowAttributes<TableRowData> = ({ rowIndex }) => ({
  role: "option",
  "aria-selected": String(customIndex.value === rowIndex),
  "data-row-index": rowIndex,
  tabindex: customIndex.value === rowIndex ? 0 : -1,
});
function selectCustomRows(keys: Array<string | number>): void {
  if (typeof keys[0] === "number") customIndex.value = keys[0];
}
function activateCustomRow({ row, e }: RowEventContext<TableRowData>): void {
  if (e.target instanceof Element && e.target.closest("input, label, button")) return;
  customIndex.value = Number(row.index);
  void insert();
}
function onCustomListKey(event: KeyboardEvent): void {
  if ((event.target as HTMLElement).tagName === "INPUT") return;
  const count = preferences.value.custom.length;
  if (!count) return;
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    customIndex.value =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : Math.max(
              0,
              Math.min(count - 1, customIndex.value + (event.key === "ArrowDown" ? 1 : -1)),
            );
    const row = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
      `[data-row-index="${customIndex.value}"]`,
    );
    row?.focus({ preventScroll: true });
    row?.scrollIntoView?.({ block: "nearest" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    void insert();
  }
}
</script>
<template>
  <Dialog
    :visible="true"
    placement="center"
    :confirm-on-enter="false"
    :header="t('drawing.symbol')"
    width="min(652px, calc(100vw - 24px))"
    :confirm-btn="{
      content: t('symbolTools.insert'),
      theme: 'primary',
      variant: 'base',
      disabled: !canInsert,
    }"
    :cancel-btn="{
      content: t(inserted || tab === 'custom' ? 'symbolTools.close' : 'symbolTools.cancel'),
      theme: 'default',
      variant: 'base',
    }"
    :close-on-overlay-click="false"
    @confirm="insert"
    @close="close"
  >
    <div class="symbol-dialog" :data-cell-edit-session="editSessionId">
      <Tabs v-model="tab" size="medium">
        <TabPanel value="symbols" :label="t('symbolTools.symbols')" />
        <TabPanel value="special" :label="t('symbolTools.special')" />
        <TabPanel value="custom" :label="t('symbolTools.custom')" />
      </Tabs>
      <div class="symbol-dialog__body">
        <section
          v-show="tab === 'symbols'"
          class="symbol-dialog__page"
          :aria-label="t('symbolTools.symbols')"
        >
          <div class="symbol-dialog__fields">
            <label class="symbol-dialog__field"
              ><span>{{ t("symbolTools.font") }}</span
              ><Select
                size="small"
                :model-value="fontId"
                @update:model-value="chooseFont"
                :options="fontOptions"
                filterable
                :disabled="loading"
            /></label>
            <label class="symbol-dialog__field" v-if="codeFormat === 'unicode-hex'"
              ><span>{{ t("symbolTools.subset") }}</span
              ><Select
                size="small"
                :value="subset"
                :options="subsetOptions"
                filterable
                :disabled="loading"
                @change="changeSubset"
            /></label>
          </div>
          <div class="symbol-dialog__search">
            <Input
              size="small"
              v-model="query"
              :placeholder="t('symbolTools.search')"
              :aria-label="t('symbolTools.search')"
              clearable
            /><Checkbox v-model="allUnicode">{{ t("symbolTools.browseAll") }}</Checkbox>
          </div>
          <div v-if="loading" class="symbol-dialog__status" role="status">
            {{ t("symbolTools.loading") }}
          </div>
          <div v-else-if="loadError" class="symbol-dialog__status" role="alert">
            {{ t("symbolTools.loadFailed") }}
            <Button theme="default" variant="base" @click="load">{{
              t("symbolTools.retry")
            }}</Button>
          </div>
          <div
            v-else-if="coverageUnknown && !allUnicode"
            class="symbol-dialog__coverage-warning"
            role="status"
          >
            {{ t("symbolTools.unverifiedFont", { family: unverifiedFontLabel }) }}
          </div>
          <SymbolCharacterGrid
            v-else-if="catalog && filtered.length"
            :points="filtered"
            :selected="selected"
            :family="font?.family ?? (fontId === 'normal-text' ? defaultFontFamily : undefined)"
            :catalog="catalog"
            :label="t('symbolTools.symbols')"
            @select="selectPoint"
            @insert="
              selectPoint($event);
              insert();
            "
          />
          <div v-else class="symbol-dialog__status" role="status">
            {{ t("symbolTools.noResults") }}
          </div>
          <div class="symbol-dialog__recent-label">
            <span>{{ t("symbolTools.recent") }}</span
            ><Button
              size="small"
              variant="text"
              theme="default"
              :disabled="!localRecent.length"
              @click="localRecent = []"
              >{{ t("symbolTools.removeRecent") }}</Button
            >
          </div>
          <div class="symbol-dialog__recent" :aria-label="t('symbolTools.recent')">
            <button
              v-for="item in localRecent"
              :key="symbolIdentity(item)"
              type="button"
              :title="`${item.text} · ${item.fontFamily ? (localFontLabels[item.fontFamily] ?? item.fontFamily) : t('symbolTools.inherited')}`"
              :style="{ fontFamily: item.fontFamily }"
              @click="pickRecent(item)"
              @dblclick="pickRecent(item, true)"
            >
              {{ /\s/u.test(item.text) ? "␣" : item.text }}
            </button>
            <span v-if="!localRecent.length" class="symbol-dialog__hint">{{
              t("symbolTools.emptyRecent")
            }}</span>
          </div>
          <div class="symbol-dialog__fields">
            <label class="symbol-dialog__field"
              ><span>{{ t("symbolTools.code") }}</span
              ><Input
                size="small"
                :value="codeInput"
                :status="invalidCode ? 'error' : undefined"
                :aria-invalid="invalidCode"
                @change="navigateCode(String($event))"
                @enter="insert"
            /></label>
            <label class="symbol-dialog__field"
              ><span>{{ t("symbolTools.from") }}</span
              ><Select size="small" v-model="codeFormat" :options="formatOptions"
            /></label>
          </div>
          <div v-if="invalidCode" class="symbol-dialog__error" role="alert">
            {{ t("symbolTools.invalidCode") }}
          </div>
          <div v-if="codeFormat !== 'unicode-hex'" class="symbol-dialog__hint">
            {{ t("symbolTools.encodingNote") }}
          </div>
        </section>
        <section
          v-show="tab === 'special'"
          class="symbol-dialog__page"
          :aria-label="t('symbolTools.special')"
        >
          <OptionList
            class="symbol-dialog__special-list"
            :model-value="String(specialIndex)"
            :options="specialOptions"
            :label="t('symbolTools.special')"
            item-data-attribute="data-symbol-special"
            @select="selectSpecial"
            @activate="activateSpecial"
          >
            <template #icon="{ option }">
              <span
                class="symbol-dialog__list-glyph"
                :title="`U+${symbolCharacterCode(option.text.codePointAt(0)!)}`"
                :style="{ fontFamily: selectedFamily(option.text) }"
                >{{ /\s/u.test(option.text) ? "␣" : option.text }}</span
              >
            </template>
          </OptionList>
        </section>
        <section
          v-show="tab === 'custom'"
          class="symbol-dialog__page"
          :aria-label="t('symbolTools.custom')"
        >
          <div
            class="symbol-dialog__custom-list"
            role="listbox"
            :aria-label="t('symbolTools.custom')"
            @keydown="onCustomListKey"
          >
            <TableHeightWrapper v-slot="{ height }">
              <PrimaryTable
                class="sheetcraft-table--mini"
                row-key="index"
                :data="customRows"
                :columns="customColumns"
                :row-attributes="customRowAttributes"
                :active-row-keys="[customIndex]"
                active-row-type="single"
                :disable-space-inactive-row="true"
                :height="height"
                :bordered="false"
                size="small"
                table-layout="fixed"
                hover
                :empty="t('symbolTools.emptyCustom')"
                @active-change="selectCustomRows"
                @row-dblclick="activateCustomRow"
              >
                <template #symbol="{ row }">
                  <span class="symbol-dialog__custom-symbol">
                    <span @click.stop @dblclick.stop>
                      <Checkbox
                        :checked="row.entry.visible"
                        :aria-label="`${t('symbolTools.visible')}: ${row.entry.text}`"
                        @change="toggleVisible(row.index, !!$event)"
                      />
                    </span>
                    <span
                      class="symbol-dialog__list-glyph"
                      :title="
                        row.entry.fontFamily
                          ? (localFontLabels[row.entry.fontFamily] ?? row.entry.fontFamily)
                          : t('symbolTools.inherited')
                      "
                      :style="{ fontFamily: row.entry.fontFamily }"
                      >{{ /\s/u.test(row.entry.text) ? "␣" : row.entry.text }}</span
                    >
                  </span>
                </template>
                <template #shortcut="{ row }"
                  ><kbd>{{ row.entry.shortcut }}</kbd></template
                >
              </PrimaryTable>
            </TableHeightWrapper>
          </div>
          <div class="symbol-dialog__shortcut">
            <label class="symbol-dialog__field"
              ><span>{{ t("symbolTools.shortcut") }}</span
              ><Input
                size="small"
                :value="shortcutInput"
                readonly
                :placeholder="t('symbolTools.shortcutCapture')"
                @keydown="(_value, context) => captureShortcut(context.e)" /></label
            ><Button
              theme="default"
              variant="base"
              :disabled="!customEntry || !shortcutInput"
              @click="assignShortcut()"
              >{{ t("symbolTools.assignShortcut") }}</Button
            ><Button
              theme="default"
              variant="text"
              :disabled="!customEntry?.shortcut"
              @click="assignShortcut(true)"
              >{{ t("symbolTools.removeShortcut") }}</Button
            >
          </div>
          <div v-if="shortcutMessage" role="status" class="symbol-dialog__hint">
            {{ t(shortcutMessage) }}
          </div>
          <div class="symbol-dialog__custom-actions">
            <Button theme="default" variant="base" :disabled="customIndex <= 0" @click="move(-1)">{{
              t("symbolTools.moveUp")
            }}</Button
            ><Button
              theme="default"
              variant="base"
              :disabled="customIndex >= preferences.custom.length - 1"
              @click="move(1)"
              >{{ t("symbolTools.moveDown") }}</Button
            ><Button
              theme="default"
              variant="base"
              :disabled="!customEntry"
              @click="removeCustom"
              >{{ t("symbolTools.remove") }}</Button
            ><Button theme="default" variant="base" @click="resetVisible = true">{{
              t("symbolTools.reset")
            }}</Button>
          </div>
        </section>
        <div v-if="displayFontStatus === 'error'" role="alert" class="symbol-dialog__error">
          {{ t("symbolTools.fontFailed") }}
          <Button theme="default" variant="text" @click="retryFont">{{
            t("symbolTools.retry")
          }}</Button>
        </div>
        <div
          v-else-if="displayFontStatus === 'loading' && current?.fontFamily"
          role="status"
          class="symbol-dialog__hint"
        >
          {{ t("symbolTools.fontLoading") }}
        </div>
        <div
          v-if="
            tab !== 'custom' &&
            current &&
            !current.fontFamily &&
            !literalActive &&
            fontId !== 'normal-text' &&
            !selectionOverride
          "
          class="symbol-dialog__hint"
        >
          {{ t("symbolTools.uncovered") }}
        </div>
        <p v-if="allUnicode && tab === 'symbols'" class="symbol-dialog__hint" role="status">
          {{ t("symbolTools.allCoverage") }}
        </p>
        <div v-if="storageError || viewStorageError" role="status" class="symbol-dialog__hint">
          {{ t("symbolTools.storageError") }}
        </div>
        <span
          v-if="preferences.custom.length >= SYMBOL_CUSTOM_LIMIT"
          class="symbol-dialog__hint"
          role="status"
          >{{ t("symbolTools.customFull") }}</span
        >
        <div v-if="tab !== 'custom'" class="symbol-dialog__page-actions">
          <Button
            theme="default"
            variant="base"
            :disabled="
              !current || alreadyCustom || preferences.custom.length >= SYMBOL_CUSTOM_LIMIT
            "
            data-symbol-add-custom
            @click="addCustom"
            >{{ t(alreadyCustom ? "symbolTools.added" : "symbolTools.addCustom") }}</Button
          >
        </div>
        <details class="symbol-dialog__extensions" :open="!!fontRestoreError">
          <summary>{{ t("symbolTools.options") }}</summary>
          <div class="symbol-dialog__extension-content">
            <SymbolFontSourceControls
              v-show="tab === 'symbols'"
              :loading="loading"
              :default-font-family="defaultFontFamily"
              :restore-error="fontRestoreError"
              @register="registerLocalFont"
            />
            <div v-if="catalog && !allUnicode && font" class="symbol-dialog__hint">
              {{
                t(font.source === "local" ? "symbolTools.localCoverage" : "symbolTools.coverage", {
                  count: points.length,
                  version: catalog.version,
                })
              }}
            </div>
            <div class="symbol-dialog__preview" :aria-label="t('symbolTools.preview')">
              <span
                class="symbol-dialog__preview-glyph"
                :style="{ fontFamily: previewFontFamily }"
                >{{ current ? (/^\s+$/u.test(current.text) ? "␣" : current.text) : "—" }}</span
              >
              <div>
                <strong>{{ current ? currentCode : t("symbolTools.noSelection") }}</strong
                ><span>{{ currentName }}</span
                ><span v-if="currentAliases">{{ currentAliases }}</span
                ><span v-if="currentMetadata">{{ currentMetadata }}</span
                ><span>{{
                  current?.fontFamily
                    ? (localFontLabels[current.fontFamily] ?? current.fontFamily)
                    : t("symbolTools.inherited")
                }}</span>
              </div>
            </div>
            <div v-show="tab === 'symbols'">
              <label class="symbol-dialog__literal symbol-dialog__field"
                ><span>{{ t("symbolTools.literal") }}</span
                ><Input
                  v-model="literal"
                  :maxlength="16"
                  :placeholder="t('symbolTools.literalHint')"
                  @change="
                    literalActive = true;
                    selectionOverride = undefined;
                  "
                  @enter="insert"
              /></label>
            </div>
            <p v-if="tab === 'special'" class="symbol-dialog__hint">
              {{ t("symbolTools.specialNote") }}
            </p>
          </div>
        </details>
      </div>
    </div>
  </Dialog>
  <Dialog
    :visible="resetVisible"
    placement="center"
    :header="t('symbolTools.reset')"
    width="min(440px, calc(100vw - 24px))"
    :confirm-btn="{ content: t('symbolTools.resetConfirm'), theme: 'primary', variant: 'base' }"
    :cancel-btn="{ content: t('symbolTools.cancel'), theme: 'default', variant: 'base' }"
    :close-on-overlay-click="false"
    @confirm="reset"
    @close="resetVisible = false"
    >{{ t("symbolTools.resetQuestion") }}</Dialog
  >
</template>
<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
@use "../../../shared/option-list/option-list" as option-list;
.symbol-dialog {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: var(--sheetcraft-font-size-body-medium);
  line-height: var(--sheetcraft-line-height-body-medium);
  &__body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: calc(100dvh - 190px);
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }
  &__page {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    min-width: 0;
    > * {
      flex-shrink: 0;
    }
  }
  &__fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }
  &__field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    > span {
      flex-shrink: 0;
      white-space: nowrap;
    }
    > :last-child {
      min-width: 0;
      flex: 1;
    }
  }
  &__search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    margin: 0;
    overflow-wrap: anywhere;
  }
  &__error {
    color: var(--sheetcraft-text-primary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
  &__status {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 12px;
    min-height: 108px;
    flex: 1 0 108px;
    color: var(--sheetcraft-text-secondary);
  }
  &__recent-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__recent {
    @include option-list.surface;
    display: flex;
    min-height: 36px;
    align-items: center;
    button {
      @include gallery.choice(0);
      flex: 0 0 34px;
      height: 34px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 21px;
      line-height: 28px;
    }
  }
  &__special-list {
    height: clamp(180px, 38dvh, 320px);
    min-height: 120px;
    flex: none;
  }
  &__custom-symbol {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  &__custom-list {
    height: clamp(160px, 34dvh, 280px);
    min-height: 120px;
    flex: none;
    overflow: hidden;
  }
  &__coverage-warning {
    padding: 8px 10px;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
  &__list-glyph {
    flex: 0 0 36px;
    max-width: 64px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    font-size: 23px;
    line-height: 28px;
  }
  &__shortcut {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    > .symbol-dialog__field {
      flex: 1 1 240px;
    }
  }
  &__custom-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    > :last-child {
      margin-inline-start: auto;
    }
  }
  &__preview {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
    border-top: 1px solid var(--sheetcraft-border-default);
    padding-top: 10px;
    > div {
      display: flex;
      flex-direction: column;
      min-width: 0;
      > span {
        overflow-wrap: anywhere;
        color: var(--sheetcraft-text-secondary);
        font-size: var(--sheetcraft-font-size-body-small);
        line-height: var(--sheetcraft-line-height-body-small);
      }
    }
    strong {
      font-weight: 500;
      overflow-wrap: anywhere;
    }
  }
  &__preview-glyph {
    flex: 0 0 58px;
    max-width: 100px;
    text-align: center;
    font-size: 32px;
    line-height: 42px;
    overflow: hidden;
  }
  &__extensions {
    flex: 0 0 auto;
    min-width: 0;
    border-top: 1px solid var(--sheetcraft-border-default);
    > summary {
      padding-block: 3px;
      color: var(--sheetcraft-text-secondary);
      cursor: pointer;
      font-size: var(--sheetcraft-font-size-body-small);
      line-height: var(--sheetcraft-line-height-body-small);
    }
    &[open] {
      max-height: 220px;
      overflow: auto;
    }
  }
  &__extension-content {
    display: grid;
    gap: 8px;
    padding-block: 6px;
  }
  &__page-actions {
    flex: none;
  }
}
@media (max-width: 580px) {
  .symbol-dialog {
    &__fields,
    &__search {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    &__body {
      max-height: calc(100dvh - 190px);
    }
    &__custom-actions > :last-child {
      margin-inline-start: 0;
    }
  }
}
</style>
