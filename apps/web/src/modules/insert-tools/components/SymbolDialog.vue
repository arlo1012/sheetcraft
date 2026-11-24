<script setup lang="ts">
import { vNativeControl } from "../../../shared/tdesign/native-control";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import { Tabs, TabPanel } from "tdesign-vue-next/es/tabs";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";
import SymbolCharacterGrid from "./SymbolCharacterGrid.vue";
import SymbolCustomTab from "./SymbolCustomTab.vue";
import SymbolExtensionsSection from "./SymbolExtensionsSection.vue";
import SymbolSpecialTab from "./SymbolSpecialTab.vue";
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
  defaultSymbolPreferences,
  moveCustomSymbol,
  SYMBOL_CUSTOM_LIMIT,
  symbolIdentity,
  useSymbolPreferences,
  validSymbolInsertion,
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
const customTabRef = ref<InstanceType<typeof SymbolCustomTab>>();
const literal = ref("");
const literalActive = ref(false);
const selectionOverride = shallowRef<SymbolInsertion>();
const inserted = ref(false);
const resetVisible = ref(false);
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
}

function saveCustomShortcut(shortcut: string | undefined): void {
  update({
    ...preferences.value,
    custom: preferences.value.custom.map((item, index) => {
      if (index !== customIndex.value) return item;
      const { shortcut: _shortcut, ...rest } = item;
      return shortcut ? { ...rest, shortcut } : rest;
    }),
  });
}

function reset(): void {
  update({ ...preferences.value, custom: defaultSymbolPreferences().custom });
  customIndex.value = 0;
  customTabRef.value?.clearShortcutInput();
  resetVisible.value = false;
}

function onLiteralChange(): void {
  literalActive.value = true;
  selectionOverride.value = undefined;
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
    <Form
      class="symbol-dialog sheetcraft-form-grid"
      :data-cell-edit-session="editSessionId"
      label-align="left"
      :label-width="locale === 'zh-CN' ? 72 : 104"
      :prevent-submit-default="true"
    >
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
            <FormItem class="symbol-dialog__field" :label="t('symbolTools.font')"
              ><Select
                v-native-control="{ attributes: { 'aria-label': t('symbolTools.font') } }"
                size="small"
                :model-value="fontId"
                @update:model-value="chooseFont"
                :options="fontOptions"
                filterable
                :disabled="loading"
            /></FormItem>
            <FormItem
              class="symbol-dialog__field"
              v-if="codeFormat === 'unicode-hex'"
              :label="t('symbolTools.subset')"
              ><Select
                v-native-control="{ attributes: { 'aria-label': t('symbolTools.subset') } }"
                size="small"
                :value="subset"
                :options="subsetOptions"
                filterable
                :disabled="loading"
                @change="changeSubset"
            /></FormItem>
          </div>
          <div class="symbol-dialog__search">
            <Input
              size="small"
              v-model="query"
              :placeholder="t('symbolTools.search')"
              v-native-control="{ attributes: { 'aria-label': t('symbolTools.search') } }"
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
            <FormItem class="symbol-dialog__field" :label="t('symbolTools.code')"
              ><Input
                v-native-control="{ attributes: { 'aria-label': t('symbolTools.code') } }"
                size="small"
                :value="codeInput"
                :status="invalidCode ? 'error' : undefined"
                :aria-invalid="invalidCode"
                @change="navigateCode(String($event))"
                @enter="insert"
            /></FormItem>
            <FormItem class="symbol-dialog__field" :label="t('symbolTools.from')"
              ><Select
                size="small"
                v-model="codeFormat"
                :options="formatOptions"
                v-native-control="{ attributes: { 'aria-label': t('symbolTools.from') } }"
            /></FormItem>
          </div>
          <div v-if="invalidCode" class="symbol-dialog__error" role="alert">
            {{ t("symbolTools.invalidCode") }}
          </div>
          <div v-if="codeFormat !== 'unicode-hex'" class="symbol-dialog__hint">
            {{ t("symbolTools.encodingNote") }}
          </div>
        </section>

        <SymbolSpecialTab
          v-model:special-index="specialIndex"
          :visible="tab === 'special'"
          :selected-family="selectedFamily"
          @insert="insert"
        />

        <SymbolCustomTab
          ref="customTabRef"
          v-model:custom-index="customIndex"
          :visible="tab === 'custom'"
          :custom="preferences.custom"
          :local-font-labels="localFontLabels"
          @insert="insert"
          @toggle-visible="toggleVisible"
          @move="move"
          @remove="removeCustom"
          @request-reset="resetVisible = true"
          @save-shortcut="saveCustomShortcut"
        />

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
        <SymbolExtensionsSection
          v-model:literal="literal"
          :tab="tab"
          :loading="loading"
          :default-font-family="defaultFontFamily"
          :font-restore-error="fontRestoreError"
          :catalog="catalog"
          :all-unicode="allUnicode"
          :font="font"
          :points-count="points.length"
          :current="current"
          :preview-font-family="previewFontFamily"
          :current-code="currentCode"
          :current-name="currentName"
          :current-aliases="currentAliases"
          :current-metadata="currentMetadata"
          :local-font-labels="localFontLabels"
          @register="registerLocalFont"
          @literal-change="onLiteralChange"
          @insert="insert"
        />
      </div>
    </Form>
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
    @include option-list.scrollbar;
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: min(492px, calc(100dvh - 190px));
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
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
    min-width: 0;
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
    color: var(--sheetcraft-status-error);
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
  &__coverage-warning {
    padding: 8px 10px;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
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
  }
}
</style>
