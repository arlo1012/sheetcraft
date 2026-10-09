<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import {
  getPagePaperSize,
  DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
  type SheetPageSetup,
} from "@sheetcraft/core/page-setup";
import { pixelsToDimensionValue, dimensionValueToPixels } from "@sheetcraft/core/dimension-units";
import { useAppI18n } from "../../../shared/i18n";

const setup = defineModel<SheetPageSetup>("setup", { required: true });
const { t } = useAppI18n();
type Unit = "pt" | "mm" | "cm" | "in";
type Margin = keyof SheetPageSetup["margins"];
const unit = ref<Unit>("pt");
const gridPatternId = `page-margin-grid-${useId().replaceAll(":", "")}`;
const unitOptions = computed(() => [
  { value: "pt", label: t("dimensionUnits.pt") },
  { value: "mm", label: t("dimensionUnits.mm") },
  { value: "cm", label: t("dimensionUnits.cm") },
  { value: "in", label: t("dimensionUnits.in") },
]);
const options = computed(() => setup.value.printOptions ?? DEFAULT_SHEET_PAGE_PRINT_OPTIONS);
const preview = computed(() => {
  let paper;
  try {
    paper = getPagePaperSize(setup.value);
  } catch {
    paper = { width: 210, height: 297 };
  }
  const height = 140,
    width = (height * paper.width) / paper.height;
  const x = (setup.value.margins.left / paper.width) * width;
  const y = (setup.value.margins.top / paper.height) * height;
  const contentWidth = Math.max(1, width - x - (setup.value.margins.right / paper.width) * width);
  const contentHeight = Math.max(
    1,
    height - y - (setup.value.margins.bottom / paper.height) * height,
  );
  const cellsWidth = Math.min(64, contentWidth),
    cellsHeight = Math.min(72, contentHeight);
  return {
    width,
    height,
    x,
    y,
    contentWidth,
    contentHeight,
    cellsWidth,
    cellsHeight,
    cellsX: x + (options.value.horizontalCentered ? (contentWidth - cellsWidth) / 2 : 0),
    cellsY: y + (options.value.verticalCentered ? (contentHeight - cellsHeight) / 2 : 0),
    headerY: (setup.value.margins.header / paper.height) * height,
    footerY: height - (setup.value.margins.footer / paper.height) * height,
  };
});
function selectMarginValue(_value: unknown, { e }: { e: FocusEvent }): void {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  void nextTick(() => {
    if (document.activeElement === input) input.select();
  });
}
function displayed(name: Margin): number {
  return Number(
    pixelsToDimensionValue((setup.value.margins[name] * 96) / 25.4, unit.value).toFixed(2),
  );
}
function update(name: Margin, value: number | undefined): void {
  if (typeof value !== "number") return;
  const margins = {
    ...setup.value.margins,
    [name]: (dimensionValueToPixels(value, unit.value) * 25.4) / 96,
  };
  margins.header = Math.min(margins.header, margins.top);
  margins.footer = Math.min(margins.footer, margins.bottom);
  setup.value = { ...setup.value, margins };
}
function setUnit(value: SelectValue): void {
  if (value === "pt" || value === "mm" || value === "cm" || value === "in") unit.value = value;
}
function center(name: "horizontalCentered" | "verticalCentered", value: boolean): void {
  setup.value = { ...setup.value, printOptions: { ...options.value, [name]: value } };
}
</script>

<template>
  <TForm class="page-setup-margins sheetcraft-form-grid" :data="setup" label-align="top">
    <div class="page-setup-margins__diagram">
      <TFormItem class="page-setup-margins__top" :label="t('pageLayout.marginTop')"
        ><TInputNumber
          :model-value="displayed('top')"
          :aria-label="t('pageLayout.marginTop')"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :min="0"
          :decimal-places="2"
          :input-props="{ onFocus: selectMarginValue }"
          data-page-setup="margin-top"
          @update:model-value="update('top', $event)"
        />
      </TFormItem>
      <TFormItem class="page-setup-margins__header" :label="t('pageLayout.marginHeader')"
        ><TInputNumber
          :model-value="displayed('header')"
          :aria-label="t('pageLayout.marginHeader')"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :min="0"
          :decimal-places="2"
          :input-props="{ onFocus: selectMarginValue }"
          data-page-setup="margin-header"
          @update:model-value="update('header', $event)"
        />
      </TFormItem>
      <TFormItem class="page-setup-margins__left" :label="t('pageLayout.marginLeft')"
        ><TInputNumber
          :model-value="displayed('left')"
          :aria-label="t('pageLayout.marginLeft')"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :min="0"
          :decimal-places="2"
          :input-props="{ onFocus: selectMarginValue }"
          data-page-setup="margin-left"
          @update:model-value="update('left', $event)"
        />
      </TFormItem>
      <div class="page-setup-margins__preview">
        <svg
          :viewBox="`0 0 ${preview.width} ${preview.height}`"
          role="img"
          :aria-label="t('pageLayout.marginPreview')"
        >
          <defs>
            <pattern
              :id="gridPatternId"
              :x="preview.cellsX"
              :y="preview.cellsY"
              :width="preview.cellsWidth / 4"
              :height="preview.cellsHeight / 12"
              patternUnits="userSpaceOnUse"
            >
              <path
                :d="`M ${preview.cellsWidth / 4} 0 H 0 V ${preview.cellsHeight / 12}`"
                class="page-setup-margins__cell-grid"
                vector-effect="non-scaling-stroke"
              />
            </pattern>
            <clipPath :id="`${gridPatternId}-print-area`">
              <rect
                :x="preview.x"
                :y="preview.y"
                :width="preview.contentWidth"
                :height="preview.contentHeight"
              />
            </clipPath>
          </defs>
          <rect
            x="0.5"
            y="0.5"
            :width="preview.width - 1"
            :height="preview.height - 1"
            class="page-setup-margins__paper"
          />
          <g :clip-path="`url(#${gridPatternId}-print-area)`">
            <rect
              :x="preview.cellsX"
              :y="preview.cellsY"
              :width="preview.cellsWidth"
              :height="preview.cellsHeight"
              class="page-setup-margins__sample-sheet"
            />
            <rect
              :x="preview.cellsX"
              :y="preview.cellsY"
              :width="preview.cellsWidth"
              :height="preview.cellsHeight"
              :fill="`url(#${gridPatternId})`"
              class="page-setup-margins__sample-outline"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <path
            :d="`M ${preview.x} 0 V ${preview.height} M ${preview.x + preview.contentWidth} 0 V ${preview.height} M 0 ${preview.y} H ${preview.width} M 0 ${preview.y + preview.contentHeight} H ${preview.width}`"
            class="page-setup-margins__guides"
            vector-effect="non-scaling-stroke"
          />
          <path
            :d="`M 0 ${preview.headerY} H ${preview.width} M 0 ${preview.footerY} H ${preview.width}`"
            class="page-setup-margins__header-footer-guides"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </div>
      <TFormItem class="page-setup-margins__right" :label="t('pageLayout.marginRight')"
        ><TInputNumber
          :model-value="displayed('right')"
          :aria-label="t('pageLayout.marginRight')"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :min="0"
          :decimal-places="2"
          :input-props="{ onFocus: selectMarginValue }"
          data-page-setup="margin-right"
          @update:model-value="update('right', $event)"
        />
      </TFormItem>
      <TFormItem class="page-setup-margins__unit" :label="t('dimensionUnits.unit')"
        ><TSelect
          class="page-setup-margins__unit-select"
          :model-value="unit"
          :options="unitOptions"
          :aria-label="t('dimensionUnits.unit')"
          data-page-setup="margin-unit"
          @change="setUnit"
        />
      </TFormItem>
      <TFormItem class="page-setup-margins__bottom" :label="t('pageLayout.marginBottom')"
        ><TInputNumber
          :model-value="displayed('bottom')"
          :aria-label="t('pageLayout.marginBottom')"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :min="0"
          :decimal-places="2"
          :input-props="{ onFocus: selectMarginValue }"
          data-page-setup="margin-bottom"
          @update:model-value="update('bottom', $event)"
        />
      </TFormItem>
      <TFormItem class="page-setup-margins__footer" :label="t('pageLayout.marginFooter')"
        ><TInputNumber
          :model-value="displayed('footer')"
          :aria-label="t('pageLayout.marginFooter')"
          theme="column"
          class="sheetcraft-input-number--persistent-controls"
          :min="0"
          :decimal-places="2"
          :input-props="{ onFocus: selectMarginValue }"
          data-page-setup="margin-footer"
          @update:model-value="update('footer', $event)"
        />
      </TFormItem>
    </div>
    <TFormItem :label="t('pageLayout.centerOnPage')">
      <div class="page-setup-margins__centering">
        <TCheckbox
          :checked="options.verticalCentered"
          data-page-setup="center-vertically"
          @change="center('verticalCentered', $event)"
          >{{ t("pageLayout.centerVertically") }}</TCheckbox
        ><TCheckbox
          :checked="options.horizontalCentered"
          data-page-setup="center-horizontally"
          @change="center('horizontalCentered', $event)"
          >{{ t("pageLayout.centerHorizontally") }}</TCheckbox
        >
      </div>
    </TFormItem>
  </TForm>
</template>

<style scoped lang="scss">
@use "./page-setup-panel" as panel;
.page-setup-margins {
  @include panel.panel;
  &__diagram {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas: ". top header" "left preview right" "unit bottom footer";
    gap: var(--sheetcraft-space-3) var(--sheetcraft-space-4);
    align-items: center;
    max-width: 420px;
    margin: 0 auto;
    width: 100%;
    > div:not(.page-setup-margins__preview) {
      min-width: 0;
    }
  }
  &__top {
    grid-area: top;
  }
  &__header {
    grid-area: header;
  }
  &__left {
    grid-area: left;
  }
  &__right {
    grid-area: right;
  }
  &__unit {
    grid-area: unit;
  }
  &__unit-select {
    width: 100%;
    min-width: 0;
  }
  &__bottom {
    grid-area: bottom;
  }
  &__footer {
    grid-area: footer;
  }
  &__preview {
    grid-area: preview;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 150px;
    color: var(--sheetcraft-text-muted);
    svg {
      width: 100%;
      height: 140px;
    }
  }
  &__paper {
    fill: var(--sheetcraft-surface-panel);
    stroke: var(--sheetcraft-text-primary);
    stroke-width: 1;
  }
  &__sample-sheet {
    fill: var(--sheetcraft-surface-panel);
  }
  &__cell-grid,
  &__sample-outline {
    stroke: var(--sheetcraft-border-control);
    stroke-width: 0.6;
  }
  &__cell-grid {
    fill: none;
  }
  &__guides {
    fill: none;
    stroke: var(--sheetcraft-border-control);
    stroke-width: 0.65;
  }
  &__header-footer-guides {
    fill: none;
    stroke: var(--sheetcraft-border-control);
    stroke-width: 0.6;
    stroke-dasharray: 1 2;
  }
  &__centering {
    display: flex;
    gap: var(--sheetcraft-space-4);
  }
}
</style>
