<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, type CSSProperties } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import {
  getSheetHeaderFooterOptions,
  type SheetHeaderFooterOptions,
  type SheetHeaderFooterParts,
  type SheetPageSetup,
} from "@sheetcraft/core/page-setup";
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
import { getHeaderFooterTypographyStyle } from "../header-footer-font-presentation";
const props = defineProps<{
  visible: boolean;
  setup: SheetPageSetup;
  target?: HeaderFooterEditTarget;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [setup: SheetPageSetup];
}>();
const { t } = useAppI18n();
const fieldRoot = ref<HTMLElement>();
const draft = ref<SheetPageSetup>(cloneHeaderFooterDraft(props.setup));
const setupError = ref("");
const section = computed(() => props.target?.section ?? "header");
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
const showFirstPage = computed(
  () => headerFooter.value.differentFirst || props.target?.variant === "first",
);
const showEvenPages = computed(
  () => headerFooter.value.differentOddEven || props.target?.variant === "even",
);
const activeText = computed(() => {
  const context = activeHeaderFooterContext.value;
  return context ? headerFooterText.value[context.variant][context.section][context.part] : "";
});
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

function cloneHeaderFooterDraft(setup: SheetPageSetup): SheetPageSetup {
  return {
    ...setup,
    header: { ...setup.header },
    footer: { ...setup.footer },
    headerFooter: getSheetHeaderFooterOptions(setup),
  };
}

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
  const result = cloneHeaderFooterDraft({ ...setup, headerFooter: options });
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
  const element = fieldRoot.value;
  return (
    element?.querySelector<HTMLTextAreaElement>(
      `[data-page-setup="${section}-${part}"] textarea`,
    ) ?? null
  );
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
): CSSProperties {
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
    ...getHeaderFooterTypographyStyle(format),
    height: "100px",
    resize: "none",
  };
}

function onHeaderFooterKeydown(_: unknown, context: { e: KeyboardEvent }): void {
  const event = context.e;
  if (event.isComposing || event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  confirm();
}

function focusHeaderFooterTarget(): void {
  const target =
    props.target ?? ({ section: section.value, part: "left", variant: "odd" } as const);
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

function confirm(): void {
  try {
    emit("confirm", applyHeaderFooterText(draft.value));
  } catch {
    setupError.value = t("pageLayout.invalidPageSetup");
  }
}
function close(): void {
  emit("update:visible", false);
}
function resetDraft(): void {
  draft.value = cloneHeaderFooterDraft(props.setup);
  setupError.value = "";
  resetHeaderFooterText();
  focusHeaderFooterTarget();
}
watch(headerFooterVariant, (variant) => {
  const context = activeHeaderFooterContext.value;
  if (!context) return;
  activeHeaderFooterContext.value = { ...context, variant, selectionStart: 0, selectionEnd: 0 };
  void nextTick(() => focusHeaderFooterInput(activeHeaderFooterContext.value!));
});
watch(
  () => [props.visible, props.setup, props.target] as const,
  ([visible]) => {
    if (visible) resetDraft();
  },
  { deep: true, immediate: true },
);
</script>
<template>
  <Dialog
    :visible="visible"
    :header="t(section === 'header' ? 'pageLayout.header' : 'pageLayout.footer')"
    width="min(560px, calc(100vw - 32px))"
    :confirm-btn="t('pageLayout.confirm')"
    :cancel-btn="t('pageLayout.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="confirm"
    @close="close"
  >
    <div ref="fieldRoot" class="header-footer-custom-dialog">
      <TTabs v-model="headerFooterVariant" data-page-setup="header-footer-variant">
        <TTabPanel
          value="odd"
          :label="
            t(
              showEvenPages
                ? 'pageLayout.headerFooterOddPages'
                : section === 'header'
                  ? 'pageLayout.header'
                  : 'pageLayout.footer',
            )
          "
        />
        <TTabPanel
          v-if="showFirstPage"
          value="first"
          :label="t('pageLayout.headerFooterFirstPage')"
        />
        <TTabPanel
          v-if="showEvenPages"
          value="even"
          :label="t('pageLayout.headerFooterEvenPages')"
        />
      </TTabs>
      <div class="header-footer-custom-dialog__panel">
        <div class="header-footer-custom-dialog__instructions">
          <p>{{ t("pageLayout.headerFooterFontHint") }}</p>
          <p>{{ t("pageLayout.headerFooterFieldsHint") }}</p>
        </div>
        <PageHeaderFooterToolbar
          :context="headerFooterToolbarContext"
          :disabled="false"
          :active="visible"
          :sample-text="activeText"
          @action="handleHeaderFooterAction"
        />
        <div class="header-footer-custom-dialog__fields">
          <label class="header-footer-custom-dialog__field">
            <span>{{ t("pageLayout.headerFooterLeft") }}</span>
            <TTextarea
              :model-value="headerFooterText[headerFooterVariant][section].left"
              @update:model-value="updateHeaderFooterText(section, 'left', String($event))"
              :aria-label="
                t(section === 'header' ? 'pageLayout.headerLeft' : 'pageLayout.footerLeft')
              "
              :maxlength="1024"
              :allow-input-over-max="false"
              :style="headerFooterInputStyle(section, 'left')"
              :data-page-setup="`${section}-left`"
              @focus="(_, context) => setHeaderFooterContext(section, 'left', context)"
              @click="setHeaderFooterContext(section, 'left', $event)"
              @keydown="onHeaderFooterKeydown"
            />
          </label>
          <label class="header-footer-custom-dialog__field">
            <span>{{ t("pageLayout.headerFooterCenter") }}</span>
            <TTextarea
              :model-value="headerFooterText[headerFooterVariant][section].center"
              @update:model-value="updateHeaderFooterText(section, 'center', String($event))"
              :aria-label="
                t(section === 'header' ? 'pageLayout.headerCenter' : 'pageLayout.footerCenter')
              "
              :maxlength="1024"
              :allow-input-over-max="false"
              :style="headerFooterInputStyle(section, 'center')"
              :data-page-setup="`${section}-center`"
              @focus="(_, context) => setHeaderFooterContext(section, 'center', context)"
              @click="setHeaderFooterContext(section, 'center', $event)"
              @keydown="onHeaderFooterKeydown"
            />
          </label>
          <label class="header-footer-custom-dialog__field">
            <span>{{ t("pageLayout.headerFooterRight") }}</span>
            <TTextarea
              :model-value="headerFooterText[headerFooterVariant][section].right"
              @update:model-value="updateHeaderFooterText(section, 'right', String($event))"
              :aria-label="
                t(section === 'header' ? 'pageLayout.headerRight' : 'pageLayout.footerRight')
              "
              :maxlength="1024"
              :allow-input-over-max="false"
              :style="headerFooterInputStyle(section, 'right')"
              :data-page-setup="`${section}-right`"
              @focus="(_, context) => setHeaderFooterContext(section, 'right', context)"
              @click="setHeaderFooterContext(section, 'right', $event)"
              @keydown="onHeaderFooterKeydown"
            />
          </label>
        </div>
      </div>
      <p v-if="setupError" role="alert" class="header-footer-custom-dialog__error">
        {{ setupError }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.header-footer-custom-dialog {
  display: grid;
  gap: var(--sheetcraft-space-3);

  &__panel {
    display: grid;
    gap: var(--sheetcraft-space-3);
    padding: var(--sheetcraft-tool-panel-padding);
  }

  &__instructions {
    display: grid;
    gap: var(--sheetcraft-space-1);

    p {
      margin: 0;
      line-height: var(--sheetcraft-line-height-body-medium);
    }
  }

  &__fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sheetcraft-space-2);
  }

  &__field {
    display: grid;
    min-width: 0;
    gap: var(--sheetcraft-space-1);
  }

  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}
</style>
