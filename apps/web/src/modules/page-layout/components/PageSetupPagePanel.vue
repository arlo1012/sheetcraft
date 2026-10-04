<script setup lang="ts">
import { computed, ref } from "vue";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { File } from "lucide-vue-next";
import { getPagePaperSize, type SheetPageSetup } from "@idea10/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";

const setup = defineModel<SheetPageSetup>("setup", { required: true });
const { t, locale } = useAppI18n();
const lastFit = ref({
  width: setup.value.fitToPage?.width ?? 1,
  height: setup.value.fitToPage?.height ?? 1,
});
const fitting = computed(
  () => setup.value.fitToPage !== null && setup.value.fitToPage !== undefined,
);
const paperOptions = computed(() => [
  { label: t("pageLayout.paperA4"), value: "a4" },
  { label: t("pageLayout.paperA3"), value: "a3" },
  { label: t("pageLayout.paperLetter"), value: "letter" },
  { label: t("pageLayout.paperLegal"), value: "legal" },
  { label: t("pageLayout.paperCustom"), value: "custom" },
]);
const fitOptions = computed(() => [
  { label: t("pageLayout.fitEntireSheet"), value: "sheet" },
  { label: t("pageLayout.fitAllColumns"), value: "columns" },
  { label: t("pageLayout.fitAllRows"), value: "rows" },
  { label: t("pageLayout.fitCustom"), value: "custom" },
]);
const fitPreset = computed(() => {
  const fit = setup.value.fitToPage ?? lastFit.value;
  return fit.width === 1 && fit.height === 1
    ? "sheet"
    : fit.width === 1 && fit.height === 0
      ? "columns"
      : fit.width === 0 && fit.height === 1
        ? "rows"
        : "custom";
});
const qualityOptions = computed(() =>
  [300, 600, 1200].map((value) => ({ value, label: t("pageLayout.printQualityDpi", { value }) })),
);
const firstPageText = computed({
  get: () => (setup.value.firstPageNumber == null ? "" : String(setup.value.firstPageNumber)),
  set: (value: string) => patch({ firstPageNumber: value.trim() === "" ? null : Number(value) }),
});
function patch(value: Partial<SheetPageSetup>): void {
  setup.value = { ...setup.value, ...value };
}
function setScalingMode(fit: boolean): void {
  if (setup.value.fitToPage) lastFit.value = { ...setup.value.fitToPage };
  patch({ fitToPage: fit ? { ...lastFit.value } : null });
}
function setFitPreset(value: SelectValue): void {
  const fit =
    value === "sheet"
      ? { width: 1, height: 1 }
      : value === "columns"
        ? { width: 1, height: 0 }
        : value === "rows"
          ? { width: 0, height: 1 }
          : { width: 2, height: 2 };
  lastFit.value = fit;
  patch({ fitToPage: fit });
}
function setFit(axis: "width" | "height", value: number | undefined): void {
  if (typeof value !== "number") return;
  const fit = { ...(setup.value.fitToPage ?? lastFit.value), [axis]: value };
  lastFit.value = fit;
  patch({ fitToPage: fit });
}
function customPaper(): void {
  const size =
    setup.value.customPaperSize ?? getPagePaperSize({ ...setup.value, orientation: "portrait" });
  patch({ paperSize: "custom", customPaperSize: { ...size } });
}
function setPaperSize(value: SelectValue): void {
  if (value === "custom") customPaper();
  else if (value === "a4" || value === "a3" || value === "letter" || value === "legal")
    patch({ paperSize: value });
}
function setPaperDimension(axis: "width" | "height", value: number | undefined): void {
  if (typeof value === "number")
    patch({
      customPaperSize: {
        ...(setup.value.customPaperSize ?? { width: 210, height: 297 }),
        [axis]: value,
      },
    });
}
function setQuality(value: SelectValue): void {
  if (typeof value === "number") patch({ printQuality: value });
}
</script>

<template>
  <TForm
    class="page-setup-page idea-form-grid"
    :data="setup"
    label-align="right"
    :label-width="locale === 'zh-CN' ? 96 : 144"
  >
    <TFormItem :label="t('pageLayout.orientation')">
      <div class="page-setup-page__orientation" data-page-setup="orientation">
        <TRadio
          :checked="setup.orientation === 'portrait'"
          @change="patch({ orientation: 'portrait' })"
          ><File class="page-setup-page__paper-icon" />{{ t("pageLayout.portrait") }}</TRadio
        >
        <TRadio
          :checked="setup.orientation === 'landscape'"
          @change="patch({ orientation: 'landscape' })"
          ><File class="page-setup-page__paper-icon page-setup-page__paper-icon--landscape" />{{
            t("pageLayout.landscape")
          }}</TRadio
        >
      </div>
    </TFormItem>
    <div class="page-setup-page__fields">
      <TFormItem :label="t('pageLayout.scaling')">
        <div class="page-setup-page__scaling">
          <div class="page-setup-page__scaling-row">
            <TRadio :checked="!fitting" @change="setScalingMode(false)">{{
              t("pageLayout.scale")
            }}</TRadio>
            <TInputNumber
              :model-value="setup.scale"
              :disabled="fitting"
              theme="column"
              class="idea-input-number--persistent-controls page-setup-page__scale"
              :min="10"
              :max="400"
              :decimal-places="0"
              :aria-label="t('pageLayout.scale')"
              data-page-setup="scale"
              @update:model-value="typeof $event === 'number' && patch({ scale: $event })"
            />
            <span>% {{ t("pageLayout.normalSize") }}</span>
          </div>
          <div class="page-setup-page__scaling-row">
            <TRadio :checked="fitting" @change="setScalingMode(true)">{{
              t("pageLayout.fitToPages")
            }}</TRadio>
            <TSelect
              :model-value="fitPreset"
              :options="fitOptions"
              :disabled="!fitting"
              :aria-label="t('pageLayout.fitToPages')"
              data-page-setup="fit-preset"
              @change="setFitPreset"
            />
          </div>
        </div>
      </TFormItem>
      <div v-if="fitting && fitPreset === 'custom'" class="page-setup-page__fit-dimensions">
        <TFormItem :label="t('pageLayout.fitWidth')"
          ><TInputNumber
            :model-value="setup.fitToPage?.width"
            :aria-label="t('pageLayout.fitWidth')"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="0"
            :max="32767"
            :decimal-places="0"
            @update:model-value="setFit('width', $event)"
          />
        </TFormItem>
        <TFormItem :label="t('pageLayout.fitHeight')" :help="t('pageLayout.fitUnlimited')"
          ><TInputNumber
            :model-value="setup.fitToPage?.height"
            :aria-label="t('pageLayout.fitHeight')"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="0"
            :max="32767"
            :decimal-places="0"
            @update:model-value="setFit('height', $event)"
          />
        </TFormItem>
      </div>
    </div>
    <div class="page-setup-page__fields">
      <TFormItem :label="t('pageLayout.paperSize')">
        <div class="page-setup-page__paper-select">
          <TSelect
            :model-value="setup.paperSize"
            :options="paperOptions"
            :aria-label="t('pageLayout.paperSize')"
            data-page-setup="paper-size"
            @change="setPaperSize"
          /><TButton variant="outline" @click="customPaper">{{
            t("pageLayout.customPaper")
          }}</TButton>
        </div>
      </TFormItem>
      <div v-if="setup.paperSize === 'custom'" class="page-setup-page__paper-dimensions">
        <TFormItem :label="t('pageLayout.paperWidth')"
          ><TInputNumber
            :model-value="setup.customPaperSize?.width"
            :aria-label="t('pageLayout.paperWidth')"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="1"
            :max="5000"
            :decimal-places="2"
            suffix="mm"
            @update:model-value="setPaperDimension('width', $event)"
          />
        </TFormItem>
        <TFormItem :label="t('pageLayout.paperHeight')"
          ><TInputNumber
            :model-value="setup.customPaperSize?.height"
            :aria-label="t('pageLayout.paperHeight')"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="1"
            :max="5000"
            :decimal-places="2"
            suffix="mm"
            @update:model-value="setPaperDimension('height', $event)"
          />
        </TFormItem>
      </div>
      <TFormItem :label="t('pageLayout.printQuality')"
        ><TSelect
          :model-value="setup.printQuality ?? 600"
          :options="qualityOptions"
          :aria-label="t('pageLayout.printQuality')"
          data-page-setup="print-quality"
          @change="setQuality"
        />
      </TFormItem>
      <TFormItem :label="t('pageLayout.firstPageNumber')"
        ><TInput
          v-model="firstPageText"
          :aria-label="t('pageLayout.firstPageNumber')"
          :placeholder="t('pageLayout.automaticPageNumber')"
          data-page-setup="first-page-number"
        />
      </TFormItem>
    </div>
  </TForm>
</template>

<style scoped lang="scss">
@use "./page-setup-panel" as panel;
.page-setup-page {
  @include panel.panel;
  &__orientation {
    display: flex;
    gap: var(--idea-space-4);
  }
  &__paper-icon {
    width: 14px;
    height: 14px;
    margin-right: var(--idea-space-1);
    vertical-align: middle;
    &--landscape {
      transform: rotate(90deg);
    }
  }
  &__scaling {
    width: 100%;
    min-width: 0;
  }
  &__scaling-row {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
    & + & {
      margin-top: var(--idea-space-2);
    }
    > :first-child {
      flex: none;
      width: 108px;
    }
    > :last-child {
      min-width: 0;
    }
  }
  &__scale {
    width: 100px;
    flex: none;
  }
  &__fields {
    display: grid;
    gap: var(--idea-space-2);
  }
  &__paper-select {
    width: 100%;
    display: flex;
    gap: var(--idea-space-2);
    min-width: 0;
    > :first-child {
      flex: 1;
      min-width: 0;
    }
    > :last-child {
      flex: none;
    }
  }
  &__paper-dimensions,
  &__fit-dimensions {
    display: grid;
    gap: var(--idea-space-2);
  }
}
</style>
