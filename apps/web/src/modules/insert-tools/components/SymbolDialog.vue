<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import { Tabs, TabPanel } from "tdesign-vue-next/es/tabs";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
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
const fontId = ref(props.defaultFontFamily ? "normal-text" : "noto-sans");
const font = computed(() => {
  if (fontId.value !== "normal-text") return fonts.value.find((entry) => entry.id === fontId.value);
  const family = props.defaultFontFamily?.toLocaleLowerCase("en-US");
  // A same-name file is not proof of the browser's current CSS face.
  return fonts.value.find((entry) => entry.family.toLocaleLowerCase("en-US") === family);
});
const normalCoverageUnknown = computed(() => fontId.value === "normal-text" && !font.value);
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
      if (props.defaultFontFamily?.startsWith("SheetcraftLocal_")) {
        const restored = await local.ensureLocalSymbolFont(props.defaultFontFamily);
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
  ...(props.defaultFontFamily
    ? [
        {
          label: `${t("symbolTools.normalText")} (${localFontLabels.value[props.defaultFontFamily] ?? props.defaultFontFamily})`,
          value: "normal-text",
        },
      ]
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
function listKey(event: KeyboardEvent, kind: "special" | "custom"): void {
  if ((event.target as HTMLElement).tagName === "INPUT") return;
  const index = kind === "special" ? specialIndex : customIndex;
  const count = kind === "special" ? SPECIAL_SYMBOLS.length : preferences.value.custom.length;
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    index.value =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : Math.max(0, Math.min(count - 1, index.value + (event.key === "ArrowDown" ? 1 : -1)));
    const row = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
      `[data-row-index="${index.value}"]`,
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
    width="min(720px, calc(100vw - 24px))"
    :confirm-btn="{ content: t('symbolTools.insert'), disabled: !canInsert }"
    :cancel-btn="t(inserted ? 'symbolTools.close' : 'symbolTools.cancel')"
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
        <SymbolFontSourceControls
          :loading="loading"
          :default-font-family="defaultFontFamily"
          :restore-error="fontRestoreError"
          @register="registerLocalFont"
        />
        <section
          v-show="tab === 'symbols'"
          class="symbol-dialog__page"
          :aria-label="t('symbolTools.symbols')"
        >
          <div class="symbol-dialog__fields">
            <label
              ><span>{{ t("symbolTools.font") }}</span
              ><Select v-model="fontId" :options="fontOptions" filterable :disabled="loading"
            /></label>
            <label v-if="codeFormat === 'unicode-hex'"
              ><span>{{ t("symbolTools.subset") }}</span
              ><Select
                :value="subset"
                :options="subsetOptions"
                filterable
                :disabled="loading"
                @change="changeSubset"
            /></label>
          </div>
          <div class="symbol-dialog__search">
            <Input
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
            v-else-if="normalCoverageUnknown && !allUnicode"
            class="symbol-dialog__status"
            role="status"
          >
            {{ t("symbolTools.unverifiedFont", { family: defaultFontFamily ?? "" }) }}
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
          <div v-if="catalog && (allUnicode || font)" class="symbol-dialog__hint">
            {{
              allUnicode
                ? t("symbolTools.allCoverage")
                : t(
                    font?.source === "local" ? "symbolTools.localCoverage" : "symbolTools.coverage",
                    {
                      count: points.length,
                      version: catalog?.version ?? "17.0.0",
                    },
                  )
            }}
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
            <label
              ><span>{{ t("symbolTools.code") }}</span
              ><Input
                :value="codeInput"
                :status="invalidCode ? 'error' : undefined"
                :aria-invalid="invalidCode"
                @change="navigateCode(String($event))"
                @enter="insert"
            /></label>
            <label
              ><span>{{ t("symbolTools.from") }}</span
              ><Select v-model="codeFormat" :options="formatOptions"
            /></label>
          </div>
          <div v-if="invalidCode" class="symbol-dialog__error" role="alert">
            {{ t("symbolTools.invalidCode") }}
          </div>
          <div v-if="codeFormat !== 'unicode-hex'" class="symbol-dialog__hint">
            {{ t("symbolTools.encodingNote") }}
          </div>
          <label class="symbol-dialog__literal"
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
        </section>
        <section
          v-show="tab === 'special'"
          class="symbol-dialog__page"
          :aria-label="t('symbolTools.special')"
        >
          <div
            class="symbol-dialog__list"
            role="listbox"
            :aria-label="t('symbolTools.special')"
            @keydown="listKey($event, 'special')"
          >
            <button
              v-for="(item, index) in SPECIAL_SYMBOLS"
              :key="item.text"
              type="button"
              role="option"
              :aria-selected="specialIndex === index"
              :tabindex="specialIndex === index ? 0 : -1"
              :data-row-index="index"
              @click="specialIndex = index"
              @dblclick="
                specialIndex = index;
                insert();
              "
            >
              <span
                class="symbol-dialog__list-glyph"
                :style="{ fontFamily: selectedFamily(item.text) }"
                >{{ /\s/u.test(item.text) ? "␣" : item.text }}</span
              ><span>{{ t(`symbolTools.${item.label}`) }}</span
              ><code>U+{{ symbolCharacterCode(item.text.codePointAt(0)!) }}</code>
            </button>
          </div>
          <p class="symbol-dialog__hint">{{ t("symbolTools.specialNote") }}</p>
        </section>
        <section
          v-show="tab === 'custom'"
          class="symbol-dialog__page"
          :aria-label="t('symbolTools.custom')"
        >
          <div class="symbol-dialog__list-heading">
            <span>{{ t("symbolTools.custom") }}</span
            ><span>{{ t("symbolTools.shortcut") }}</span>
          </div>
          <div
            class="symbol-dialog__list symbol-dialog__custom-list"
            role="listbox"
            :aria-label="t('symbolTools.custom')"
            @keydown="listKey($event, 'custom')"
          >
            <div
              v-for="(item, index) in preferences.custom"
              :key="symbolIdentity(item)"
              role="option"
              :aria-selected="customIndex === index"
              :tabindex="customIndex === index ? 0 : -1"
              :data-row-index="index"
              @click="customIndex = index"
              @dblclick="
                customIndex = index;
                insert();
              "
            >
              <Checkbox
                :checked="item.visible"
                :aria-label="`${t('symbolTools.visible')}: ${item.text}`"
                @click.stop
                @dblclick.stop
                @change="toggleVisible(index, !!$event)"
              />
              <span class="symbol-dialog__list-glyph" :style="{ fontFamily: item.fontFamily }">{{
                /\s/u.test(item.text) ? "␣" : item.text
              }}</span
              ><span class="symbol-dialog__custom-font">{{
                item.fontFamily
                  ? localFontLabels[item.fontFamily]
                    ? `${localFontLabels[item.fontFamily]} · ${item.fontFamily.slice(-6)}`
                    : item.fontFamily
                  : t("symbolTools.inherited")
              }}</span
              ><kbd>{{ item.shortcut }}</kbd>
            </div>
            <p v-if="!preferences.custom.length" class="symbol-dialog__hint">
              {{ t("symbolTools.emptyCustom") }}
            </p>
          </div>
          <div class="symbol-dialog__shortcut">
            <label
              ><span>{{ t("symbolTools.shortcut") }}</span
              ><Input
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
        <div class="symbol-dialog__preview" :aria-label="t('symbolTools.preview')">
          <span class="symbol-dialog__preview-glyph" :style="{ fontFamily: previewFontFamily }">{{
            current ? (/^\s+$/u.test(current.text) ? "␣" : current.text) : "—"
          }}</span>
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
        <div v-if="storageError" role="status" class="symbol-dialog__hint">
          {{ t("symbolTools.storageError") }}
        </div>
        <Button
          v-if="tab !== 'custom'"
          class="symbol-dialog__add"
          theme="default"
          variant="base"
          :disabled="!current || alreadyCustom || preferences.custom.length >= SYMBOL_CUSTOM_LIMIT"
          @click="addCustom"
          >{{ t(alreadyCustom ? "symbolTools.added" : "symbolTools.addCustom") }}</Button
        >
        <span v-if="preferences.custom.length >= SYMBOL_CUSTOM_LIMIT" class="symbol-dialog__hint">{{
          t("symbolTools.customFull")
        }}</span>
      </div>
    </div>
  </Dialog>
  <Dialog
    :visible="resetVisible"
    placement="center"
    :header="t('symbolTools.reset')"
    width="min(440px, calc(100vw - 24px))"
    :confirm-btn="t('symbolTools.resetConfirm')"
    :cancel-btn="t('symbolTools.cancel')"
    :close-on-overlay-click="false"
    @confirm="reset"
    @close="resetVisible = false"
    >{{ t("symbolTools.resetQuestion") }}</Dialog
  >
</template>
<style scoped lang="scss">
.symbol-dialog {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 12px;
  line-height: 20px;
  &__body {
    display: grid;
    gap: 10px;
    max-height: calc(100dvh - 230px);
    min-height: 120px;
    overflow: auto;
    padding-block: 12px 2px;
    overscroll-behavior: contain;
  }
  &__page {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  &__fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }
  label {
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
    font-size: 12px;
    line-height: 18px;
    margin: 0;
    overflow-wrap: anywhere;
  }
  &__error {
    color: var(--sheetcraft-text-primary);
    font-size: 12px;
    line-height: 18px;
  }
  &__status {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 12px;
    min-height: 216px;
    color: var(--sheetcraft-text-secondary);
    border: 1px solid var(--sheetcraft-border-default);
  }
  &__recent-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__recent {
    display: flex;
    min-height: 36px;
    overflow-x: auto;
    border: 1px solid var(--sheetcraft-border-default);
    border-radius: 4px;
    align-items: center;
    button {
      flex: 0 0 34px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      height: 34px;
      padding: 0;
      font-size: 21px;
      border: 0;
      background: transparent;
      color: var(--sheetcraft-text-primary);
      cursor: pointer;
      &:hover {
        background: var(--sheetcraft-surface-hover);
      }
    }
  }
  &__list {
    height: 300px;
    overflow: auto;
    border: 1px solid var(--sheetcraft-border-default);
    border-radius: 4px;
    > button,
    > [role="option"] {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 36px;
      padding: 4px 10px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--sheetcraft-text-primary);
      text-align: start;
      font: inherit;
      cursor: pointer;
      &[aria-selected="true"] {
        background: var(--sheetcraft-surface-hover);
        border-color: var(--sheetcraft-action-primary);
      }
      &:hover {
        background: var(--sheetcraft-surface-hover);
      }
      code,
      kbd {
        margin-inline-start: auto;
        white-space: nowrap;
        color: var(--sheetcraft-text-secondary);
        font-size: 12px;
      }
    }
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
  &__list-heading {
    display: flex;
    justify-content: space-between;
    padding-inline: 10px;
    font-weight: 500;
  }
  &__custom-font {
    color: var(--sheetcraft-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__shortcut {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    label {
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
        font-size: 12px;
        line-height: 18px;
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
  &__add {
    justify-self: start;
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
      max-height: calc(100dvh - 230px);
    }
    &__custom-actions > :last-child {
      margin-inline-start: 0;
    }
  }
}
</style>
