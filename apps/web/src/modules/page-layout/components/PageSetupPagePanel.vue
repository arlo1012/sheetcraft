<script setup lang="ts">
import { computed, ref } from "vue";
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
const { t } = useAppI18n();
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
  <div class="page-setup-page">
    <section :aria-label="t('pageLayout.orientation')">
      <h3>{{ t("pageLayout.orientation") }}</h3>
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
    </section>
    <section :aria-label="t('pageLayout.scaling')">
      <h3>{{ t("pageLayout.scaling") }}</h3>
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
      <div v-if="fitting && fitPreset === 'custom'" class="page-setup-page__fit-dimensions">
        <div role="group" :aria-label="t('pageLayout.fitWidth')">
          <span>{{ t("pageLayout.fitWidth") }}</span
          ><TInputNumber
            :model-value="setup.fitToPage?.width"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="0"
            :max="32767"
            :decimal-places="0"
            @update:model-value="setFit('width', $event)"
          />
        </div>
        <div role="group" :aria-label="t('pageLayout.fitHeight')">
          <span>{{ t("pageLayout.fitHeight") }}</span
          ><TInputNumber
            :model-value="setup.fitToPage?.height"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="0"
            :max="32767"
            :decimal-places="0"
            @update:model-value="setFit('height', $event)"
          />
        </div>
        <span class="page-setup-page__hint">{{ t("pageLayout.fitUnlimited") }}</span>
      </div>
    </section>
    <div class="page-setup-page__fields">
      <div class="page-setup-page__row" role="group" :aria-label="t('pageLayout.paperSize')">
        <span>{{ t("pageLayout.paperSize") }}</span>
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
      </div>
      <div v-if="setup.paperSize === 'custom'" class="page-setup-page__paper-dimensions">
        <div role="group" :aria-label="t('pageLayout.paperWidth')">
          <span>{{ t("pageLayout.paperWidth") }}</span
          ><TInputNumber
            :model-value="setup.customPaperSize?.width"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="1"
            :max="5000"
            :decimal-places="2"
            suffix="mm"
            @update:model-value="setPaperDimension('width', $event)"
          />
        </div>
        <div role="group" :aria-label="t('pageLayout.paperHeight')">
          <span>{{ t("pageLayout.paperHeight") }}</span
          ><TInputNumber
            :model-value="setup.customPaperSize?.height"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="1"
            :max="5000"
            :decimal-places="2"
            suffix="mm"
            @update:model-value="setPaperDimension('height', $event)"
          />
        </div>
      </div>
      <div class="page-setup-page__row" role="group" :aria-label="t('pageLayout.printQuality')">
        <span>{{ t("pageLayout.printQuality") }}</span
        ><TSelect
          :model-value="setup.printQuality ?? 600"
          :options="qualityOptions"
          :aria-label="t('pageLayout.printQuality')"
          data-page-setup="print-quality"
          @change="setQuality"
        />
      </div>
      <div class="page-setup-page__row">
        <span>{{ t("pageLayout.firstPageNumber") }}</span
        ><TInput
          v-model="firstPageText"
          :aria-label="t('pageLayout.firstPageNumber')"
          :placeholder="t('pageLayout.automaticPageNumber')"
          data-page-setup="first-page-number"
        />
      </div>
    </div>
  </div>
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
  &__scaling-row {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
    margin-top: var(--idea-space-2);
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
  &__row {
    @include panel.row;
  }
  &__paper-select {
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--idea-space-2);
    margin-left: 96px;
    > div {
      display: grid;
      gap: var(--idea-space-1);
    }
  }
  &__fit-dimensions {
    margin: var(--idea-space-2) 0 0 116px;
  }
  &__hint {
    grid-column: 1 / -1;
    color: var(--idea-text-secondary);
  }
}
</style>
