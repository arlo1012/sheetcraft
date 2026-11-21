<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { FilterX, Settings2 } from "lucide-vue-next";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import type { SheetSlicerDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  MAX_TABLE_SLICER_COLUMNS,
  type SheetSlicerState,
  type TableSlicerStyleId,
} from "@sheetcraft/core/table-slicers";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { useAppI18n } from "../../../shared/i18n";
import { TABLE_SLICER_STYLES } from "../slicer-styles";
import type { TableSlicerOptionsPatch } from "../useTableSlicers";

const props = defineProps<{
  drawing: SheetSlicerDrawing;
  state?: SheetSlicerState;
  disabled?: boolean;
  filterEditable?: boolean;
}>();

const emit = defineEmits<{
  update: [patch: TableSlicerOptionsPatch];
  clearFilter: [];
  openSettings: [];
}>();

const { t, locale } = useAppI18n();
const caption = ref(props.drawing.slicer.caption ?? props.state?.fieldName ?? props.drawing.name);
const columns = ref(props.drawing.slicer.columns ?? 1);

watch(
  () => [props.drawing.id, props.drawing.slicer.caption, props.state?.fieldName],
  () => {
    caption.value = props.drawing.slicer.caption ?? props.state?.fieldName ?? props.drawing.name;
  },
);

watch(
  () => [props.drawing.id, props.drawing.slicer.columns],
  () => {
    columns.value = props.drawing.slicer.columns ?? 1;
  },
);

function commitCaption(): void {
  const trimmed = caption.value.trim();
  const fieldName = props.state?.fieldName ?? props.drawing.name;
  const nextCaption = !trimmed || trimmed === fieldName ? undefined : trimmed;
  if (nextCaption !== props.drawing.slicer.caption) emit("update", { caption: nextCaption });
  void nextTick(() => {
    caption.value = props.drawing.slicer.caption ?? props.state?.fieldName ?? props.drawing.name;
  });
}

function onCaptionKeydown(_value: string | number, context: { e: KeyboardEvent }): void {
  if (context.e.isComposing) return;
  if (context.e.key === "Enter") {
    context.e.preventDefault();
    context.e.stopPropagation();
    commitCaption();
  } else if (context.e.key === "Escape") {
    context.e.preventDefault();
    context.e.stopPropagation();
    caption.value = props.drawing.slicer.caption ?? props.state?.fieldName ?? props.drawing.name;
  }
}

function onColumnsChange(value: number | string | undefined): void {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return;
  const clamped = Math.max(1, Math.min(MAX_TABLE_SLICER_COLUMNS, Math.round(numeric)));
  columns.value = clamped;
  emit("update", { columns: clamped });
}

function currentStyleId(): TableSlicerStyleId {
  return props.drawing.slicer.styleId ?? "light-blue";
}
</script>

<template>
  <RibbonToolbar class="slicer-toolbar" data-slicer-tools-toolbar :label="t('tables.slicerTools')">
    <section
      class="slicer-toolbar__group"
      role="group"
      data-ribbon-group="slicer-options"
      :aria-label="t('tables.slicerOptions')"
    >
      <label class="slicer-toolbar__caption">
        <span>{{ t("tables.slicerCaption") }}</span>
        <Input
          v-model="caption"
          size="small"
          :disabled="disabled"
          :placeholder="state?.fieldName ?? t('tables.slicerCaptionPlaceholder')"
          data-slicer-caption
          @blur="commitCaption"
          @keydown="onCaptionKeydown"
        />
      </label>
      <RibbonButton
        variant="tall"
        :disabled="disabled"
        :label="t('tables.slicerSettings')"
        :text="t('tables.slicerSettings')"
        data-slicer-action="settings"
        @activate="emit('openSettings')"
        ><Settings2
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="!filterEditable || !state?.filtered"
        :label="t('tables.slicerClear')"
        :text="t('tables.slicerClear')"
        data-slicer-action="clear-filter"
        @activate="emit('clearFilter')"
        ><FilterX
      /></RibbonButton>
    </section>

    <section
      class="slicer-toolbar__group"
      role="group"
      data-ribbon-group="slicer-styles"
      :aria-label="t('tables.slicerStyles')"
    >
      <div class="slicer-toolbar__styles">
        <button
          v-for="preset in TABLE_SLICER_STYLES"
          :key="preset.id"
          type="button"
          class="slicer-toolbar__swatch"
          :class="{ 'is-selected': currentStyleId() === preset.id }"
          :disabled="disabled"
          :title="preset.label[locale === 'zh-CN' ? 'zh-CN' : 'en-US']"
          :aria-label="preset.label[locale === 'zh-CN' ? 'zh-CN' : 'en-US']"
          :aria-pressed="currentStyleId() === preset.id"
          :data-slicer-style-option="preset.id"
          @click="emit('update', { styleId: preset.id })"
        >
          <span
            class="slicer-toolbar__swatch-card"
            :style="{ borderColor: preset.border, background: preset.background }"
          >
            <span
              class="slicer-toolbar__swatch-head"
              :style="{
                background: preset.headerBg,
                borderBottomColor: preset.headerBorder,
              }"
            />
            <span
              class="slicer-toolbar__swatch-pill"
              :style="{
                background: preset.selectedBg,
                borderColor: preset.selectedBorder,
              }"
            />
            <span
              class="slicer-toolbar__swatch-pill"
              :style="{
                background: preset.itemBg,
                borderColor: preset.itemBorder,
              }"
            />
          </span>
        </button>
      </div>
    </section>

    <section
      class="slicer-toolbar__group"
      role="group"
      data-ribbon-group="slicer-buttons"
      :aria-label="t('tables.slicerColumns')"
    >
      <div class="slicer-toolbar__field" role="group" :aria-label="t('tables.slicerColumns')">
        <span class="slicer-toolbar__field-label">{{ t("tables.slicerColumns") }}</span>
        <InputNumber
          :value="columns"
          theme="column"
          size="small"
          class="sheetcraft-input-number--persistent-controls slicer-toolbar__columns-input"
          :min="1"
          :max="MAX_TABLE_SLICER_COLUMNS"
          :step="1"
          :decimal-places="0"
          :disabled="disabled"
          data-slicer-columns-input
          @change="onColumnsChange"
        />
      </div>
      <div class="slicer-toolbar__toggles">
        <Checkbox
          :checked="drawing.slicer.showHeader !== false"
          :disabled="disabled"
          data-slicer-option="showHeader"
          @change="emit('update', { showHeader: Boolean($event) })"
        >
          {{ t("tables.slicerShowHeader") }}
        </Checkbox>
        <Checkbox
          :checked="drawing.slicer.hideNoData === true"
          :disabled="disabled"
          data-slicer-option="hideNoData"
          @change="emit('update', { hideNoData: Boolean($event) })"
        >
          {{ t("tables.slicerHideNoData") }}
        </Checkbox>
      </div>
    </section>
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.slicer-toolbar {
  &__group {
    @include ribbon.columns;
  }

  &__caption {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    width: 132px;

    span {
      font-size: var(--sheetcraft-font-size-body-small);
      line-height: var(--sheetcraft-line-height-body-small);
      color: var(--sheetcraft-text-secondary);
    }
  }

  &__styles {
    display: grid;
    grid-template-columns: repeat(5, 34px);
    grid-template-rows: repeat(2, 24px);
    gap: 4px;
    align-content: center;
  }

  &__swatch {
    display: grid;
    place-items: center;
    padding: 2px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--sheetcraft-icon-button-hover-bg);
    }

    &.is-selected {
      border-color: var(--sheetcraft-action-primary);
      background: var(--sheetcraft-surface-selected);
    }

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }

  &__swatch-card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 1px;
    box-sizing: border-box;
    border: 1px solid;
    border-radius: 2px;
    overflow: hidden;
  }

  &__swatch-head {
    flex: 0 0 4px;
    border-bottom: 1px solid;
  }

  &__swatch-pill {
    flex: 1 1 0;
    border: 1px solid;
    border-radius: 1px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  &__field-label {
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    color: var(--sheetcraft-text-secondary);
  }

  &__columns-input {
    width: 74px;
  }

  &__toggles {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding-left: 4px;
  }
}
</style>
