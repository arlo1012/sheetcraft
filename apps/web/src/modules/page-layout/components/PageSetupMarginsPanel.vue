<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import {
  getPagePaperSize,
  DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import { pixelsToDimensionValue, dimensionValueToPixels } from "@idea10/core/dimension-units";
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
  const cellsWidth = Math.min(52, contentWidth),
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
  <div class="page-setup-margins">
    <div class="page-setup-margins__unit" role="group" :aria-label="t('dimensionUnits.unit')">
      <span>{{ t("dimensionUnits.unit") }}</span
      ><TSelect
        class="page-setup-margins__unit-select"
        :model-value="unit"
        :options="unitOptions"
        :aria-label="t('dimensionUnits.unit')"
        data-page-setup="margin-unit"
        @change="setUnit"
      />
    </div>
    <div class="page-setup-margins__layout">
      <div class="page-setup-margins__fields">
        <div class="page-setup-margins__field" role="group" :aria-label="t('pageLayout.marginTop')">
          <span>{{ t("pageLayout.marginTop") }}</span
          ><TInputNumber
            :model-value="displayed('top')"
            theme="column"
            class="idea-input-number--persistent-controls page-setup-margins__input"
            :min="0"
            :decimal-places="2"
            data-page-setup="margin-top"
            @update:model-value="update('top', $event)"
          />
        </div>
        <div
          class="page-setup-margins__field"
          role="group"
          :aria-label="t('pageLayout.marginBottom')"
        >
          <span>{{ t("pageLayout.marginBottom") }}</span
          ><TInputNumber
            :model-value="displayed('bottom')"
            theme="column"
            class="idea-input-number--persistent-controls page-setup-margins__input"
            :min="0"
            :decimal-places="2"
            data-page-setup="margin-bottom"
            @update:model-value="update('bottom', $event)"
          />
        </div>
        <div
          class="page-setup-margins__field"
          role="group"
          :aria-label="t('pageLayout.marginLeft')"
        >
          <span>{{ t("pageLayout.marginLeft") }}</span
          ><TInputNumber
            :model-value="displayed('left')"
            theme="column"
            class="idea-input-number--persistent-controls page-setup-margins__input"
            :min="0"
            :decimal-places="2"
            data-page-setup="margin-left"
            @update:model-value="update('left', $event)"
          />
        </div>
        <div
          class="page-setup-margins__field"
          role="group"
          :aria-label="t('pageLayout.marginRight')"
        >
          <span>{{ t("pageLayout.marginRight") }}</span
          ><TInputNumber
            :model-value="displayed('right')"
            theme="column"
            class="idea-input-number--persistent-controls page-setup-margins__input"
            :min="0"
            :decimal-places="2"
            data-page-setup="margin-right"
            @update:model-value="update('right', $event)"
          />
        </div>
        <div
          class="page-setup-margins__field"
          role="group"
          :aria-label="t('pageLayout.marginHeader')"
        >
          <span>{{ t("pageLayout.marginHeader") }}</span
          ><TInputNumber
            :model-value="displayed('header')"
            theme="column"
            class="idea-input-number--persistent-controls page-setup-margins__input"
            :min="0"
            :decimal-places="2"
            data-page-setup="margin-header"
            @update:model-value="update('header', $event)"
          />
        </div>
        <div
          class="page-setup-margins__field"
          role="group"
          :aria-label="t('pageLayout.marginFooter')"
        >
          <span>{{ t("pageLayout.marginFooter") }}</span
          ><TInputNumber
            :model-value="displayed('footer')"
            theme="column"
            class="idea-input-number--persistent-controls page-setup-margins__input"
            :min="0"
            :decimal-places="2"
            data-page-setup="margin-footer"
            @update:model-value="update('footer', $event)"
          />
        </div>
      </div>
      <div class="page-setup-margins__preview">
        <span class="page-setup-margins__preview-label">{{ t("pageLayout.preview") }}</span>
        <svg
          :viewBox="`0 0 ${preview.width} ${preview.height}`"
          role="img"
          :aria-label="t('pageLayout.marginPreview')"
        >
          <defs>
            <pattern :id="gridPatternId" width="8" height="6" patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 6" fill="none" stroke="currentColor" stroke-width="0.5" />
            </pattern>
          </defs>
          <rect
            x="0.5"
            y="0.5"
            :width="preview.width - 1"
            :height="preview.height - 1"
            class="page-setup-margins__paper"
          />
          <rect
            :x="preview.cellsX"
            :y="preview.cellsY"
            :width="preview.cellsWidth"
            :height="preview.cellsHeight"
            :fill="`url(#${gridPatternId})`"
          />
          <rect
            :x="preview.x"
            :y="preview.y"
            :width="preview.contentWidth"
            :height="preview.contentHeight"
            class="page-setup-margins__guides"
          />
          <path
            :d="`M 0 ${preview.headerY} H ${preview.width} M 0 ${preview.footerY} H ${preview.width}`"
            class="page-setup-margins__guides"
          />
        </svg>
      </div>
    </div>
    <section class="page-setup-margins__centering" :aria-label="t('pageLayout.centerOnPage')">
      <h3>{{ t("pageLayout.centerOnPage") }}</h3>
      <div class="page-setup-margins__centering-options">
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
    </section>
  </div>
</template>

<style scoped lang="scss">
@use "./page-setup-panel" as panel;

.page-setup-margins {
  @include panel.panel;
  min-height: 0;
  gap: var(--idea-space-6);
  padding: var(--idea-dialog-content-padding-block) 0 0;

  &__unit {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--idea-space-4);
  }

  &__unit-select {
    width: 128px;
    min-width: 0;
  }

  &__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 144px;
    align-items: start;
    gap: var(--idea-space-6);
  }

  &__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--idea-space-5) var(--idea-space-6);
  }

  &__field {
    display: grid;
    gap: var(--idea-space-2);
    min-width: 0;
  }

  &__input {
    width: 100%;
    min-width: 0;
  }

  &__preview {
    display: grid;
    justify-items: center;
    gap: var(--idea-space-3);
    color: var(--idea-text-muted);

    svg {
      width: 100%;
      height: 144px;
    }
  }

  &__preview-label {
    color: var(--idea-text-secondary);
  }

  &__paper {
    fill: var(--idea-surface-panel);
    stroke: var(--idea-border-strong);
    stroke-width: 1;
  }

  &__guides {
    fill: none;
    stroke: var(--idea-border-strong);
    stroke-width: 0.7;
  }

  &__centering {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--idea-space-4) var(--idea-space-6);

    h3 {
      margin: 0;
    }
  }

  &__centering-options {
    display: flex;
    gap: var(--idea-space-6);
  }
}

@media (max-width: 480px) {
  .page-setup-margins {
    &__layout {
      grid-template-columns: minmax(0, 1fr);
    }

    &__preview {
      order: -1;
    }
  }
}
</style>
