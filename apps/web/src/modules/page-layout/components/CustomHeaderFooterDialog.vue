<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import {
  getSheetHeaderFooterOptions,
  type SheetHeaderFooterOptions,
  type SheetHeaderFooterParts,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
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
  target?: HeaderFooterEditTarget;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [setup: SheetPageSetup];
}>();
const { t } = useAppI18n();
const form = ref<InstanceType<typeof TForm>>();
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
  const element = form.value?.$el as HTMLElement | undefined;
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
  const target =
    props.target ?? ({ section: section.value, part: "center", variant: "odd" } as const);
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
    :header="t(section === 'header' ? 'pageLayout.customHeader' : 'pageLayout.customFooter')"
    width="min(680px, calc(100vw - 32px))"
    :confirm-btn="t('pageLayout.confirm')"
    :cancel-btn="t('pageLayout.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="confirm"
    @close="close"
  >
    <TForm ref="form" :data="draft" layout="vertical" class="header-footer-custom-dialog">
      <TRadioGroup v-model="headerFooterVariant" data-page-setup="header-footer-variant"
        ><TRadio
          v-for="variant in headerFooterVariants"
          :key="variant.value"
          :value="variant.value"
          >{{ variant.label }}</TRadio
        ></TRadioGroup
      >
      <PageHeaderFooterToolbar
        :setup="{ ...draft, headerFooter }"
        :context="headerFooterToolbarContext"
        :disabled="false"
        :show-options="false"
        :show-finish="false"
        @action="handleHeaderFooterAction"
      />
      <div class="header-footer-custom-dialog__fields">
        <template v-if="section === 'header'">
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
        </template>
        <template v-else>
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
        </template>
      </div>
      <p v-if="setupError" role="alert" class="header-footer-custom-dialog__error">
        {{ setupError }}
      </p>
    </TForm>
  </Dialog>
</template>
<style scoped lang="scss">
.header-footer-custom-dialog {
  display: grid;
  gap: var(--idea-space-3);
  &__fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--idea-space-3);
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
  @media (max-width: 560px) {
    &__fields {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
