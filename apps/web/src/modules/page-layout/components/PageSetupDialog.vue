<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { formatCellAddress, parseCellAddress } from "@idea10/core/coordinates";
import { cloneSheetPageSetup, type SheetPageSetup } from "@idea10/core/page-setup";
import type { CellRange } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  visible: boolean;
  setup: SheetPageSetup;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [setup: SheetPageSetup];
}>();
const { t, locale } = useAppI18n();
const draft = ref<SheetPageSetup>(cloneSheetPageSetup(props.setup));
const printAreaText = ref("");
const printAreaError = ref("");
const setupError = ref("");
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
}

function confirm(): void {
  const printArea = parseRange(printAreaText.value);
  if (printArea === undefined) {
    printAreaError.value = t("pageLayout.invalidPrintArea");
    return;
  }
  printAreaError.value = "";
  try {
    const setup = cloneSheetPageSetup({ ...draft.value, printArea });
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
      :data="draft"
      layout="vertical"
      :label-width="locale === 'zh-CN' ? 80 : 112"
      @submit.prevent="confirm"
    >
      <section class="page-setup-dialog__section" :aria-label="t('pageLayout.pageSetup')">
        <TFormItem :label="t('pageLayout.paperSize')">
          <TSelect v-model="draft.paperSize" :options="paperOptions" data-page-setup="paper-size" />
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
          <TSelect v-model="draft.pageOrder" :options="orderOptions" data-page-setup="page-order" />
        </TFormItem>
      </section>

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

      <section
        class="page-setup-dialog__section page-setup-dialog__section--wide"
        :aria-label="t('pageLayout.header')"
      >
        <h3>{{ t("pageLayout.header") }}</h3>
        <TFormItem :label="t('pageLayout.headerLeft')">
          <TInput
            v-model="draft.header.left"
            :aria-label="t('pageLayout.headerLeft')"
            :maxlength="1024"
          />
        </TFormItem>
        <TFormItem :label="t('pageLayout.headerCenter')">
          <TInput
            v-model="draft.header.center"
            :aria-label="t('pageLayout.headerCenter')"
            :maxlength="1024"
          />
        </TFormItem>
        <TFormItem :label="t('pageLayout.headerRight')">
          <TInput
            v-model="draft.header.right"
            :aria-label="t('pageLayout.headerRight')"
            :maxlength="1024"
          />
        </TFormItem>
      </section>

      <section
        class="page-setup-dialog__section page-setup-dialog__section--wide"
        :aria-label="t('pageLayout.footer')"
      >
        <h3>{{ t("pageLayout.footer") }}</h3>
        <TFormItem :label="t('pageLayout.footerLeft')">
          <TInput
            v-model="draft.footer.left"
            :aria-label="t('pageLayout.footerLeft')"
            :maxlength="1024"
          />
        </TFormItem>
        <TFormItem :label="t('pageLayout.footerCenter')">
          <TInput
            v-model="draft.footer.center"
            :aria-label="t('pageLayout.footerCenter')"
            :maxlength="1024"
          />
        </TFormItem>
        <TFormItem :label="t('pageLayout.footerRight')">
          <TInput
            v-model="draft.footer.right"
            :aria-label="t('pageLayout.footerRight')"
            :maxlength="1024"
          />
        </TFormItem>
      </section>

      <p v-if="setupError" class="page-setup-dialog__error" role="alert">{{ setupError }}</p>
      <section class="page-setup-dialog__breaks" :aria-label="t('pageLayout.manualBreak')">
        <p>{{ t("pageLayout.breakHint") }}</p>
        <TButton variant="outline" @click="resetManualBreaks">{{
          t("pageLayout.resetManualBreaks")
        }}</TButton>
      </section>
    </TForm>
  </Dialog>
</template>

<style scoped lang="scss">
.page-setup-dialog {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--idea-space-4);
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
  .page-setup-dialog,
  .page-setup-dialog__section--wide {
    grid-template-columns: minmax(0, 1fr);
  }
  .page-setup-dialog__section--wide > * {
    grid-column: auto;
  }
}
</style>
