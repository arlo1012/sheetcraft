<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { formatCellAddress, parseCellAddress } from "@idea10/core/coordinates";
import {
  cloneSheetPageSetup,
  getSheetHeaderFooterOptions,
  type SheetHeaderFooterOptions,
  type SheetHeaderFooterParts,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import type { CellRange } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import {
  DEFAULT_HEADER_FOOTER_FORMAT,
  decodeHeaderFooterText,
  encodeHeaderFooterText,
  parseHeaderFooterRuns,
} from "../header-footer-text";
import {
  headerFooterLabels,
  insertAtSelection,
  mergeHeaderFooterFormat,
} from "../useHeaderFooterFields";
import type { HeaderFooterEditTarget, HeaderFooterEditorAction } from "../header-footer-editor";
import type { HeaderFooterFormat } from "../header-footer-text";
import PageHeaderFooterToolbar from "./PageHeaderFooterToolbar.vue";

const props = defineProps<{
  visible: boolean;
  setup: SheetPageSetup;
  initialTab?: "page" | "margins" | "header-footer" | "sheet";
  headerFooterTarget?: HeaderFooterEditTarget;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [setup: SheetPageSetup];
}>();
const { t, locale } = useAppI18n();
const form = ref<InstanceType<typeof TForm>>();
const draft = ref<SheetPageSetup>(cloneSheetPageSetup(props.setup));
const activeTab = ref<"page" | "margins" | "header-footer" | "sheet">("page");
const printAreaText = ref("");
const printAreaError = ref("");
const setupError = ref("");
type HeaderFooterVariant = "odd" | "first" | "even";
type HeaderFooterSection = "header" | "footer";
type HeaderFooterPart = keyof SheetHeaderFooterParts;
type HeaderFooterActiveContext = {
  section: HeaderFooterSection;
  part: HeaderFooterPart;
  variant: HeaderFooterVariant;
  selectionStart: number;
  selectionEnd: number;
};
type HeaderFooterEditorText = Record<
  HeaderFooterVariant,
  Record<HeaderFooterSection, SheetHeaderFooterParts>
>;
const headerFooterVariant = ref<HeaderFooterVariant>("odd");
const headerFooter = ref<SheetHeaderFooterOptions>(getSheetHeaderFooterOptions(draft.value));
const headerFooterText = ref<HeaderFooterEditorText>(emptyHeaderFooterEditorText());
const changedHeaderFooterSections = new Set<string>();
const headerFooterFormats = reactive(new Map<string, HeaderFooterFormat>());
const activeHeaderFooterContext = ref<HeaderFooterActiveContext>();
const fieldLabels = computed(() => headerFooterLabels(t));
const paperOptions = computed(() => [
  { label: t("pageLayout.paperA4"), value: "a4" },
  { label: t("pageLayout.paperA3"), value: "a3" },
  { label: t("pageLayout.paperLetter"), value: "letter" },
  { label: t("pageLayout.paperLegal"), value: "legal" },
]);
const orderOptions = computed(() => [
  { label: t("pageLayout.downThenOver"), value: "downThenOver" },
  { label: t("pageLayout.overThenDown"), value: "overThenDown" },
]);
const headerFooterVariants = computed(() => [
  { label: t("pageLayout.headerFooterOddPages"), value: "odd" },
  { label: t("pageLayout.headerFooterFirstPage"), value: "first" },
  { label: t("pageLayout.headerFooterEvenPages"), value: "even" },
]);
const headerFooterToolbarContext = computed(() => {
  const context = activeHeaderFooterContext.value;
  if (!context) return undefined;
  const key = sectionKey(context.variant, context.section, context.part);
  const raw = variantParts(draft.value, headerFooter.value, context.variant, context.section)[
    context.part
  ];
  return {
    ...context,
    format:
      headerFooterFormats.get(key) ??
      parseHeaderFooterRuns(raw)[0]?.format ??
      DEFAULT_HEADER_FOOTER_FORMAT,
  };
});

function emptyParts(): SheetHeaderFooterParts {
  return { left: "", center: "", right: "" };
}

function emptyHeaderFooterEditorText(): HeaderFooterEditorText {
  return {
    odd: { header: emptyParts(), footer: emptyParts() },
    first: { header: emptyParts(), footer: emptyParts() },
    even: { header: emptyParts(), footer: emptyParts() },
  };
}

function variantParts(
  setup: SheetPageSetup,
  options: SheetHeaderFooterOptions,
  variant: HeaderFooterVariant,
  section: HeaderFooterSection,
): SheetHeaderFooterParts {
  if (variant === "odd") return setup[section];
  if (variant === "first") return section === "header" ? options.firstHeader : options.firstFooter;
  return section === "header" ? options.evenHeader : options.evenFooter;
}

function sectionKey(
  variant: HeaderFooterVariant,
  section: HeaderFooterSection,
  part: HeaderFooterPart,
): string {
  return `${variant}:${section}:${part}`;
}

function resetHeaderFooterText(): void {
  const options = getSheetHeaderFooterOptions(draft.value);
  headerFooter.value = options;
  const text = emptyHeaderFooterEditorText();
  for (const variant of ["odd", "first", "even"] as const)
    for (const section of ["header", "footer"] as const) {
      const source = variantParts(draft.value, options, variant, section);
      for (const part of ["left", "center", "right"] as const)
        text[variant][section][part] = decodeHeaderFooterText(source[part], fieldLabels.value);
    }
  headerFooterText.value = text;
  changedHeaderFooterSections.clear();
  headerFooterFormats.clear();
  activeHeaderFooterContext.value = undefined;
  headerFooterVariant.value = "odd";
}

function updateHeaderFooterText(
  section: HeaderFooterSection,
  part: HeaderFooterPart,
  value: string,
): void {
  headerFooterText.value[headerFooterVariant.value][section][part] = value;
  changedHeaderFooterSections.add(sectionKey(headerFooterVariant.value, section, part));
}

function applyHeaderFooterText(setup: SheetPageSetup): SheetPageSetup {
  const options = headerFooter.value;
  const result = cloneSheetPageSetup({ ...setup, headerFooter: options });
  for (const variant of ["odd", "first", "even"] as const)
    for (const section of ["header", "footer"] as const)
      for (const part of ["left", "center", "right"] as const) {
        if (!changedHeaderFooterSections.has(sectionKey(variant, section, part))) continue;
        const source = variantParts(result, options, variant, section);
        const format =
          headerFooterFormats.get(sectionKey(variant, section, part)) ??
          parseHeaderFooterRuns(source[part])[0]?.format;
        const encoded = encodeHeaderFooterText(
          headerFooterText.value[variant][section][part],
          fieldLabels.value,
          format,
        );
        if (variant === "odd") result[section][part] = encoded;
        else {
          const target =
            variant === "first"
              ? section === "header"
                ? result.headerFooter!.firstHeader
                : result.headerFooter!.firstFooter
              : section === "header"
                ? result.headerFooter!.evenHeader
                : result.headerFooter!.evenFooter;
          target[part] = encoded;
        }
      }
  return result;
}

function headerFooterInput(
  section: HeaderFooterSection,
  part: HeaderFooterPart,
): HTMLTextAreaElement | null {
  const element = form.value?.$el as HTMLElement | undefined;
  return (
    element?.querySelector<HTMLTextAreaElement>(
      `[data-page-setup="${section}-${part}"] textarea`,
    ) ?? null
  );
}

function setHeaderFooterOptions(value: SheetHeaderFooterOptions): void {
  headerFooter.value = value;
}

function setHeaderFooterContext(
  section: HeaderFooterSection,
  part: HeaderFooterPart,
  event?: unknown,
): void {
  const emitted =
    typeof event === "object" && event !== null && "e" in event
      ? (event as { e?: unknown }).e
      : event;
  const target =
    emitted instanceof Event && emitted.target instanceof HTMLTextAreaElement
      ? emitted.target
      : headerFooterInput(section, part);
  activeHeaderFooterContext.value = {
    section,
    part,
    variant: headerFooterVariant.value,
    selectionStart: target?.selectionStart ?? 0,
    selectionEnd: target?.selectionEnd ?? 0,
  };
}

function handleHeaderFooterAction(action: HeaderFooterEditorAction): void {
  const context = activeHeaderFooterContext.value;
  if (!context) return;
  const text = headerFooterText.value[context.variant][context.section][context.part];
  const key = sectionKey(context.variant, context.section, context.part);
  if (action.type === "insertField") {
    const input = headerFooterInput(context.section, context.part);
    const inserted = insertAtSelection(
      text,
      input?.selectionStart ?? context.selectionStart,
      input?.selectionEnd ?? context.selectionEnd,
      `&[${fieldLabels.value[action.field]}]`,
    );
    updateHeaderFooterText(context.section, context.part, inserted.value);
    activeHeaderFooterContext.value = {
      ...context,
      selectionStart: inserted.caret,
      selectionEnd: inserted.caret,
    };
    void nextTick(() => focusHeaderFooterInput(context, inserted.caret));
  } else if (action.type === "format") {
    const raw = variantParts(draft.value, headerFooter.value, context.variant, context.section)[
      context.part
    ];
    const format = headerFooterFormats.get(key) ?? parseHeaderFooterRuns(raw)[0]?.format;
    headerFooterFormats.set(key, mergeHeaderFooterFormat(format, action.patch));
    changedHeaderFooterSections.add(key);
  }
}

function focusHeaderFooterInput(
  context: Pick<HeaderFooterActiveContext, "section" | "part">,
  caret?: number,
): void {
  const input = headerFooterInput(context.section, context.part);
  input?.focus();
  if (caret !== undefined) input?.setSelectionRange(caret, caret);
}

function headerFooterInputStyle(
  section: HeaderFooterSection,
  part: HeaderFooterPart,
): Record<string, string | number | boolean> {
  const context = activeHeaderFooterContext.value;
  const variant =
    context?.section === section && context.part === part
      ? context.variant
      : headerFooterVariant.value;
  const key = sectionKey(variant, section, part);
  const raw = variantParts(draft.value, headerFooter.value, variant, section)[part];
  const format =
    headerFooterFormats.get(key) ??
    parseHeaderFooterRuns(raw)[0]?.format ??
    DEFAULT_HEADER_FOOTER_FORMAT;
  return {
    fontFamily: format.fontFamily,
    fontSize: `${format.fontSize}pt`,
    fontWeight: format.bold ? "bold" : "normal",
    fontStyle: format.italic ? "italic" : "normal",
    textDecoration: format.underline ? "underline" : "none",
    color: `#${format.color}`,
  };
}

function onHeaderFooterKeydown(_: unknown, context: { e: KeyboardEvent }): void {
  const event = context.e;
  if (event.isComposing || event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  confirm();
}

function focusHeaderFooterTarget(): void {
  const target = props.headerFooterTarget;
  if (!target) return;
  headerFooterVariant.value = target.variant;
  void nextTick(() => {
    const input = headerFooterInput(target.section, target.part);
    input?.focus();
    const caret = input?.value.length ?? 0;
    input?.setSelectionRange(caret, caret);
    activeHeaderFooterContext.value = {
      ...target,
      selectionStart: caret,
      selectionEnd: caret,
    };
  });
}

function formatRange(range: CellRange | null): string {
  if (!range) return "";
  const start = formatCellAddress(range.start);
  const end = formatCellAddress(range.end);
  return start === end ? start : `${start}:${end}`;
}

function parseRange(value: string): CellRange | null | undefined {
  const text = value.trim();
  if (!text) return null;
  if (text.includes("!") || text.includes(",")) return undefined;
  const pieces = text.replaceAll("$", "").split(":");
  if (pieces.length > 2) return undefined;
  const [first, last = first] = pieces;
  if (!first || !last) return undefined;
  const start = parseCellAddress(first);
  const end = parseCellAddress(last);
  if (!start || !end) return undefined;
  return {
    start: {
      row: Math.min(start.row, end.row),
      column: Math.min(start.column, end.column),
    },
    end: {
      row: Math.max(start.row, end.row),
      column: Math.max(start.column, end.column),
    },
  };
}

function resetDraft(): void {
  draft.value = cloneSheetPageSetup(props.setup);
  printAreaText.value = formatRange(draft.value.printArea);
  printAreaError.value = "";
  setupError.value = "";
  resetHeaderFooterText();
  activeTab.value = props.headerFooterTarget ? "header-footer" : (props.initialTab ?? "page");
  if (props.headerFooterTarget) focusHeaderFooterTarget();
}

function confirm(): void {
  const printArea = parseRange(printAreaText.value);
  if (printArea === undefined) {
    printAreaError.value = t("pageLayout.invalidPrintArea");
    return;
  }
  printAreaError.value = "";
  try {
    const setup = cloneSheetPageSetup({
      ...applyHeaderFooterText(draft.value),
      printArea,
    });
    setupError.value = "";
    emit("confirm", setup);
  } catch {
    setupError.value = t("pageLayout.invalidPageSetup");
  }
}

function close(): void {
  emit("update:visible", false);
}

function resetManualBreaks(): void {
  draft.value = { ...draft.value, rowBreaks: [], columnBreaks: [] };
}

watch(
  () => [draft.value.margins.top, draft.value.margins.bottom] as const,
  ([top, bottom]) => {
    if (Number.isFinite(top) && Number.isFinite(draft.value.margins.header)) {
      draft.value.margins.header = Math.min(draft.value.margins.header, top);
    }
    if (Number.isFinite(bottom) && Number.isFinite(draft.value.margins.footer)) {
      draft.value.margins.footer = Math.min(draft.value.margins.footer, bottom);
    }
  },
);
watch(activeTab, (tab) => {
  if (tab !== "header-footer") return;
  const context = activeHeaderFooterContext.value;
  if (context) {
    headerFooterVariant.value = context.variant;
    void nextTick(() => focusHeaderFooterInput(context));
  } else {
    activeHeaderFooterContext.value = {
      section: "header",
      part: "center",
      variant: headerFooterVariant.value,
      selectionStart: 0,
      selectionEnd: 0,
    };
    void nextTick(() => focusHeaderFooterInput(activeHeaderFooterContext.value!));
  }
});
watch(headerFooterVariant, (variant) => {
  const context = activeHeaderFooterContext.value;
  if (!context) return;
  activeHeaderFooterContext.value = { ...context, variant, selectionStart: 0, selectionEnd: 0 };
  void nextTick(() => focusHeaderFooterInput(activeHeaderFooterContext.value!));
});
watch(
  () => props.headerFooterTarget,
  () => {
    if (props.visible && props.headerFooterTarget) {
      activeTab.value = "header-footer";
      focusHeaderFooterTarget();
    }
  },
  { deep: true },
);
watch(
  () => [props.visible, props.setup] as const,
  ([visible]) => {
    if (visible) resetDraft();
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('pageLayout.pageSetup')"
    width="min(720px, calc(100vw - 32px))"
    :confirm-btn="t('pageLayout.confirm')"
    :cancel-btn="t('pageLayout.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="confirm"
    @close="close"
  >
    <TForm
      class="page-setup-dialog"
      ref="form"
      :data="draft"
      layout="vertical"
      :label-width="locale === 'zh-CN' ? 80 : 112"
      @submit.prevent="confirm"
    >
      <TTabs v-model="activeTab" class="page-setup-dialog__tabs">
        <TTabPanel value="page" :label="t('pageLayout.page')">
          <div class="page-setup-dialog__panel">
            <section class="page-setup-dialog__section" :aria-label="t('pageLayout.pageSetup')">
              <TFormItem :label="t('pageLayout.paperSize')">
                <TSelect
                  v-model="draft.paperSize"
                  :options="paperOptions"
                  data-page-setup="paper-size"
                />
              </TFormItem>
              <TFormItem :label="t('pageLayout.orientation')">
                <TRadioGroup v-model="draft.orientation" data-page-setup="orientation">
                  <TRadio value="portrait">{{ t("pageLayout.portrait") }}</TRadio>
                  <TRadio value="landscape">{{ t("pageLayout.landscape") }}</TRadio>
                </TRadioGroup>
              </TFormItem>
              <TFormItem :label="t('pageLayout.scale')">
                <TInputNumber
                  v-model="draft.scale"
                  theme="column"
                  class="idea-input-number--persistent-controls"
                  :min="10"
                  :max="400"
                  :decimal-places="0"
                  suffix="%"
                  data-page-setup="scale"
                />
              </TFormItem>
              <TFormItem :label="t('pageLayout.pageOrder')">
                <TSelect
                  v-model="draft.pageOrder"
                  :options="orderOptions"
                  data-page-setup="page-order"
                />
              </TFormItem>
            </section>
          </div>
        </TTabPanel>
        <TTabPanel value="margins" :label="t('pageLayout.margins')">
          <div class="page-setup-dialog__panel">
            <section
              class="page-setup-dialog__section page-setup-dialog__section--margins"
              :aria-label="t('pageLayout.margins')"
            >
              <h3>
                {{ t("pageLayout.margins") }}
                <span>({{ t("pageLayout.rulerUnit") }})</span>
              </h3>
              <TFormItem :label="t('pageLayout.marginTop')">
                <TInputNumber
                  v-model="draft.margins.top"
                  theme="column"
                  class="idea-input-number--persistent-controls"
                  :min="0"
                  :decimal-places="2"
                  data-page-setup="margin"
                />
              </TFormItem>
              <TFormItem :label="t('pageLayout.marginBottom')">
                <TInputNumber
                  v-model="draft.margins.bottom"
                  theme="column"
                  class="idea-input-number--persistent-controls"
                  :min="0"
                  :decimal-places="2"
                  data-page-setup="margin"
                />
              </TFormItem>
              <TFormItem :label="t('pageLayout.marginLeft')">
                <TInputNumber
                  v-model="draft.margins.left"
                  theme="column"
                  class="idea-input-number--persistent-controls"
                  :min="0"
                  :decimal-places="2"
                  data-page-setup="margin"
                />
              </TFormItem>
              <TFormItem :label="t('pageLayout.marginRight')">
                <TInputNumber
                  v-model="draft.margins.right"
                  theme="column"
                  class="idea-input-number--persistent-controls"
                  :min="0"
                  :decimal-places="2"
                  data-page-setup="margin"
                />
              </TFormItem>
              <TFormItem :label="t('pageLayout.marginHeader')">
                <TInputNumber
                  v-model="draft.margins.header"
                  theme="column"
                  class="idea-input-number--persistent-controls"
                  :min="0"
                  :decimal-places="2"
                  data-page-setup="margin"
                />
              </TFormItem>
              <TFormItem :label="t('pageLayout.marginFooter')">
                <TInputNumber
                  v-model="draft.margins.footer"
                  theme="column"
                  class="idea-input-number--persistent-controls"
                  :min="0"
                  :decimal-places="2"
                  data-page-setup="margin"
                />
              </TFormItem>
            </section>
          </div>
        </TTabPanel>
        <TTabPanel value="header-footer" :label="t('pageLayout.headerFooterTools')">
          <div class="page-setup-dialog__panel">
            <section
              class="page-setup-dialog__section page-setup-dialog__section--wide"
              :aria-label="t('pageLayout.header')"
            >
              <p class="page-setup-dialog__hint">
                {{ t("pageLayout.headerFooterDialogHint") }}
              </p>
              <PageHeaderFooterToolbar
                :setup="{ ...draft, headerFooter }"
                :context="headerFooterToolbarContext"
                :disabled="false"
                :show-options="false"
                :show-finish="false"
                @action="handleHeaderFooterAction"
                @options-change="setHeaderFooterOptions"
              />
              <h3>{{ t("pageLayout.header") }}</h3>
              <TRadioGroup v-model="headerFooterVariant" data-page-setup="header-footer-variant">
                <TRadio
                  v-for="variant in headerFooterVariants"
                  :key="variant.value"
                  :value="variant.value"
                >
                  {{ variant.label }}
                </TRadio>
              </TRadioGroup>
              <div class="page-setup-dialog__header-footer-options">
                <TCheckbox
                  v-model="headerFooter.differentFirst"
                  data-page-setup-option="different-first"
                >
                  {{ t("pageLayout.headerFooterDifferentFirst") }}
                </TCheckbox>
                <TCheckbox
                  v-model="headerFooter.differentOddEven"
                  data-page-setup-option="different-odd-even"
                >
                  {{ t("pageLayout.headerFooterDifferentOddEven") }}
                </TCheckbox>
                <TCheckbox
                  v-model="headerFooter.scaleWithDocument"
                  data-page-setup-option="scale-with-document"
                >
                  {{ t("pageLayout.headerFooterScaleWithDocument") }}
                </TCheckbox>
                <TCheckbox
                  v-model="headerFooter.alignWithMargins"
                  data-page-setup-option="align-with-margins"
                >
                  {{ t("pageLayout.headerFooterAlignWithMargins") }}
                </TCheckbox>
              </div>
              <TFormItem :label="t('pageLayout.headerLeft')">
                <label class="page-setup-dialog__text-field">
                  <span class="ui-visually-hidden">{{ t("pageLayout.headerLeft") }}</span>
                  <TTextarea
                    :model-value="headerFooterText[headerFooterVariant].header.left"
                    @update:model-value="updateHeaderFooterText('header', 'left', $event)"
                    :aria-label="t('pageLayout.headerLeft')"
                    :maxlength="1024"
                    :style="headerFooterInputStyle('header', 'left')"
                    data-page-setup="header-left"
                    @focus="(_, context) => setHeaderFooterContext('header', 'left', context)"
                    @click="setHeaderFooterContext('header', 'left', $event)"
                    @keydown="onHeaderFooterKeydown"
                  />
                </label>
              </TFormItem>
              <TFormItem :label="t('pageLayout.headerCenter')">
                <label class="page-setup-dialog__text-field">
                  <span class="ui-visually-hidden">{{ t("pageLayout.headerCenter") }}</span>
                  <TTextarea
                    :model-value="headerFooterText[headerFooterVariant].header.center"
                    @update:model-value="updateHeaderFooterText('header', 'center', $event)"
                    :aria-label="t('pageLayout.headerCenter')"
                    :maxlength="1024"
                    :style="headerFooterInputStyle('header', 'center')"
                    data-page-setup="header-center"
                    @focus="(_, context) => setHeaderFooterContext('header', 'center', context)"
                    @click="setHeaderFooterContext('header', 'center', $event)"
                    @keydown="onHeaderFooterKeydown"
                  />
                </label>
              </TFormItem>
              <TFormItem :label="t('pageLayout.headerRight')">
                <label class="page-setup-dialog__text-field">
                  <span class="ui-visually-hidden">{{ t("pageLayout.headerRight") }}</span>
                  <TTextarea
                    :model-value="headerFooterText[headerFooterVariant].header.right"
                    @update:model-value="updateHeaderFooterText('header', 'right', $event)"
                    :aria-label="t('pageLayout.headerRight')"
                    :maxlength="1024"
                    :style="headerFooterInputStyle('header', 'right')"
                    data-page-setup="header-right"
                    @focus="(_, context) => setHeaderFooterContext('header', 'right', context)"
                    @click="setHeaderFooterContext('header', 'right', $event)"
                    @keydown="onHeaderFooterKeydown"
                  />
                </label>
              </TFormItem>
            </section>

            <section
              class="page-setup-dialog__section page-setup-dialog__section--wide"
              :aria-label="t('pageLayout.footer')"
            >
              <h3>{{ t("pageLayout.footer") }}</h3>
              <TFormItem :label="t('pageLayout.footerLeft')">
                <label class="page-setup-dialog__text-field">
                  <span class="ui-visually-hidden">{{ t("pageLayout.footerLeft") }}</span>
                  <TTextarea
                    :model-value="headerFooterText[headerFooterVariant].footer.left"
                    @update:model-value="updateHeaderFooterText('footer', 'left', $event)"
                    :aria-label="t('pageLayout.footerLeft')"
                    :maxlength="1024"
                    :style="headerFooterInputStyle('footer', 'left')"
                    data-page-setup="footer-left"
                    @focus="(_, context) => setHeaderFooterContext('footer', 'left', context)"
                    @click="setHeaderFooterContext('footer', 'left', $event)"
                    @keydown="onHeaderFooterKeydown"
                  />
                </label>
              </TFormItem>
              <TFormItem :label="t('pageLayout.footerCenter')">
                <label class="page-setup-dialog__text-field">
                  <span class="ui-visually-hidden">{{ t("pageLayout.footerCenter") }}</span>
                  <TTextarea
                    :model-value="headerFooterText[headerFooterVariant].footer.center"
                    @update:model-value="updateHeaderFooterText('footer', 'center', $event)"
                    :aria-label="t('pageLayout.footerCenter')"
                    :maxlength="1024"
                    :style="headerFooterInputStyle('footer', 'center')"
                    data-page-setup="footer-center"
                    @focus="(_, context) => setHeaderFooterContext('footer', 'center', context)"
                    @click="setHeaderFooterContext('footer', 'center', $event)"
                    @keydown="onHeaderFooterKeydown"
                  />
                </label>
              </TFormItem>
              <TFormItem :label="t('pageLayout.footerRight')">
                <label class="page-setup-dialog__text-field">
                  <span class="ui-visually-hidden">{{ t("pageLayout.footerRight") }}</span>
                  <TTextarea
                    :model-value="headerFooterText[headerFooterVariant].footer.right"
                    @update:model-value="updateHeaderFooterText('footer', 'right', $event)"
                    :aria-label="t('pageLayout.footerRight')"
                    :maxlength="1024"
                    :style="headerFooterInputStyle('footer', 'right')"
                    data-page-setup="footer-right"
                    @focus="(_, context) => setHeaderFooterContext('footer', 'right', context)"
                    @click="setHeaderFooterContext('footer', 'right', $event)"
                    @keydown="onHeaderFooterKeydown"
                  />
                </label>
              </TFormItem>
            </section>
          </div>
        </TTabPanel>
        <TTabPanel value="sheet" :label="t('pageLayout.worksheet')">
          <div class="page-setup-dialog__panel">
            <section
              class="page-setup-dialog__section page-setup-dialog__section--wide"
              :aria-label="t('pageLayout.printArea')"
            >
              <TFormItem
                :label="t('pageLayout.printArea')"
                :tips="printAreaError || t('pageLayout.printAreaHint')"
                :status="printAreaError ? 'error' : undefined"
              >
                <TInput
                  v-model="printAreaText"
                  :aria-label="t('pageLayout.printArea')"
                  :placeholder="t('pageLayout.printAreaHint')"
                  data-page-setup="print-area"
                />
              </TFormItem>
            </section>

            <section class="page-setup-dialog__breaks" :aria-label="t('pageLayout.manualBreak')">
              <p>{{ t("pageLayout.breakHint") }}</p>
              <TButton variant="outline" @click="resetManualBreaks">{{
                t("pageLayout.resetManualBreaks")
              }}</TButton>
            </section>
          </div>
        </TTabPanel>
      </TTabs>

      <p v-if="setupError" class="page-setup-dialog__error" role="alert">
        {{ setupError }}
      </p>
    </TForm>
  </Dialog>
</template>

<style scoped lang="scss">
.page-setup-dialog__tabs {
  min-width: 0;
}
.page-setup-dialog__panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--idea-space-4);
  padding-top: var(--idea-space-4);
}
.page-setup-dialog__text-field {
  display: block;
}
.page-setup-dialog__section {
  min-width: 0;
}
.page-setup-dialog__section--margins {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--idea-space-3);
}
.page-setup-dialog__section--margins h3,
.page-setup-dialog__section--wide {
  grid-column: 1 / -1;
}
.page-setup-dialog__section--wide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 var(--idea-space-3);
}
.page-setup-dialog__section--wide h3,
.page-setup-dialog__section--wide > :first-child {
  grid-column: 1 / -1;
}
.page-setup-dialog__header-footer-options {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--idea-space-2) var(--idea-space-3);
  margin: var(--idea-space-2) 0;
}
.page-setup-dialog__hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--idea-text-secondary);
}
.page-setup-dialog :deep(.page-header-footer-toolbar) {
  grid-column: 1 / -1;
}
.page-setup-dialog h3 {
  margin: 0 0 var(--idea-space-2);
  font-size: var(--idea-font-size-body-medium);
  color: var(--idea-text-primary);
}
.page-setup-dialog h3 span {
  color: var(--idea-text-secondary);
  font-weight: var(--idea-font-weight-regular);
}
.page-setup-dialog__error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--idea-status-error);
}
.page-setup-dialog__breaks {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--idea-space-3);
  padding-top: var(--idea-space-3);
  border-top: 1px solid var(--idea-border-subtle);
}
.page-setup-dialog__breaks p {
  margin: 0;
  color: var(--idea-text-secondary);
}
@media (max-width: 560px) {
  .page-setup-dialog__panel,
  .page-setup-dialog__section--wide {
    grid-template-columns: minmax(0, 1fr);
  }
  .page-setup-dialog__section--wide > * {
    grid-column: auto;
  }
}
</style>
