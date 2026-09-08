<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { formatComputedValueForDisplay } from "@idea10/core/input";
import type {
  CellStylePatch,
  HorizontalCellAlignment,
  VerticalCellAlignment,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue?: string | number | boolean | null;
}>();
const emit = defineEmits<{ "update:patch": [patch: CellStylePatch] }>();
const { t } = useAppI18n();
const horizontalOptions = computed(() => [
  { label: t("format.alignLeft"), value: "left" },
  { label: t("format.alignCenter"), value: "center" },
  { label: t("format.alignRight"), value: "right" },
]);
const verticalOptions = computed(() => [
  { label: t("format.alignTop"), value: "top" },
  { label: t("format.alignMiddle"), value: "middle" },
  { label: t("format.alignBottom"), value: "bottom" },
]);
const hasHorizontalPatch = computed(() => Object.hasOwn(props.patch, "horizontalAlign"));
const hasVerticalPatch = computed(() => Object.hasOwn(props.patch, "verticalAlign"));
const hasWrapPatch = computed(() => Object.hasOwn(props.patch, "wrapText"));
const horizontalMixed = computed(
  () => !hasHorizontalPatch.value && props.state.horizontalAlign.mixed,
);
const verticalMixed = computed(() => !hasVerticalPatch.value && props.state.verticalAlign.mixed);
const wrapMixed = computed(() => !hasWrapPatch.value && props.state.wrapText === "mixed");
const previewHorizontal = computed<HorizontalCellAlignment>(() =>
  horizontalMixed.value ? "left" : (horizontal() ?? "left"),
);
const previewVertical = computed<VerticalCellAlignment | "middle">(() =>
  verticalMixed.value ? "middle" : (vertical() ?? "middle"),
);
const previewJustifyContent = computed(
  () =>
    ({
      top: "flex-start",
      middle: "center",
      bottom: "flex-end",
    })[previewVertical.value],
);
const previewText = computed(() =>
  props.sampleValue === null || props.sampleValue === undefined
    ? t("cellFormat.alignmentPreviewText")
    : formatComputedValueForDisplay(props.sampleValue),
);
function horizontal(): HorizontalCellAlignment | undefined {
  if (Object.hasOwn(props.patch, "horizontalAlign"))
    return (props.patch.horizontalAlign || "left") as HorizontalCellAlignment;
  return props.state.horizontalAlign.mixed
    ? undefined
    : (props.state.horizontalAlign.value ?? "left");
}
function vertical(): VerticalCellAlignment | undefined {
  if (Object.hasOwn(props.patch, "verticalAlign"))
    return (props.patch.verticalAlign || "middle") as VerticalCellAlignment;
  return props.state.verticalAlign.mixed
    ? undefined
    : (props.state.verticalAlign.value ?? "middle");
}
function wrapped(): boolean {
  const value = Object.hasOwn(props.patch, "wrapText")
    ? props.patch.wrapText
    : props.state.wrapText === "on"
      ? true
      : null;
  return value === true;
}
function setHorizontal(value: SelectValue): void {
  if (typeof value === "string")
    emit("update:patch", { horizontalAlign: value as HorizontalCellAlignment });
}
function setVertical(value: SelectValue): void {
  if (typeof value === "string")
    emit("update:patch", {
      verticalAlign: value === "middle" ? null : (value as VerticalCellAlignment),
    });
}
function setWrap(value: boolean): void {
  emit("update:patch", { wrapText: value ? true : null });
}
</script>
<template>
  <section class="cell-format-alignment" :aria-label="t('cellFormat.alignment')">
    <div class="cell-format-alignment__fields">
      <label class="cell-format-alignment__field"
        ><span>{{ t("cellFormat.horizontal") }}</span
        ><TSelect
          :model-value="horizontal()"
          :options="horizontalOptions"
          :placeholder="state.horizontalAlign.mixed ? t('format.mixed') : undefined"
          data-cell-format-horizontal
          @change="setHorizontal" /></label
      ><label class="cell-format-alignment__field"
        ><span>{{ t("cellFormat.vertical") }}</span
        ><TSelect
          :model-value="vertical()"
          :options="verticalOptions"
          :placeholder="state.verticalAlign.mixed ? t('format.mixed') : undefined"
          data-cell-format-vertical
          @change="setVertical"
      /></label>
    </div>
    <TCheckbox
      class="cell-format-alignment__wrap"
      :model-value="wrapped()"
      :indeterminate="!Object.hasOwn(patch, 'wrapText') && state.wrapText === 'mixed'"
      data-cell-format-wrap
      @change="setWrap"
      >{{ t("cellFormat.wrapText") }}</TCheckbox
    >
    <div class="cell-format-alignment__preview-group">
      <div class="cell-format-alignment__preview-heading">
        <span>{{ t("cellFormat.preview") }}</span>
        <span
          v-if="horizontalMixed || verticalMixed || wrapMixed"
          class="cell-format-alignment__mixed-status"
        >
          <template v-if="horizontalMixed"
            >{{ t("cellFormat.horizontal") }}: {{ t("format.mixed") }}</template
          >
          <template v-if="verticalMixed">
            <span v-if="horizontalMixed"> · </span>{{ t("cellFormat.vertical") }}:
            {{ t("format.mixed") }}
          </template>
          <template v-if="wrapMixed">
            <span v-if="horizontalMixed || verticalMixed"> · </span>{{ t("cellFormat.wrapText") }}:
            {{ t("format.mixed") }}
          </template>
        </span>
      </div>
      <div class="cell-format-preview cell-format-alignment__preview">
        <div
          class="cell-format-alignment__sample-cell"
          :class="{
            'is-mixed': horizontalMixed || verticalMixed || wrapMixed,
            'is-wrapped': wrapped(),
          }"
          :style="{
            justifyContent: previewJustifyContent,
            textAlign: previewHorizontal,
          }"
        >
          <span>{{ previewText }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped lang="scss">
@use "../styles/format-panel";

.cell-format-alignment {
  display: grid;
  gap: 16px;
  padding: 16px 0 0;
  color: var(--idea-text-secondary);
  font-size: 13px;

  &__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  &__field {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  &__wrap {
    justify-self: start;
  }

  &__preview-group {
    display: grid;
    gap: 8px;
  }

  &__preview-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    line-height: 20px;
  }

  &__mixed-status {
    color: var(--idea-text-secondary);
    font-size: 12px;
  }

  &__preview {
    position: relative;
    box-sizing: border-box;
    height: 136px;
    padding: 0;
    background-color: var(--idea-surface-secondary);
    background-image:
      linear-gradient(var(--idea-border-subtle) 1px, transparent 1px),
      linear-gradient(90deg, var(--idea-border-subtle) 1px, transparent 1px);
    background-position: -1px -1px;
    background-size: 33.333% 50%;
  }

  &__sample-cell {
    position: absolute;
    inset-block: 34px;
    left: 50%;
    display: flex;
    flex-direction: column;
    width: min(280px, calc(100% - 48px));
    min-width: 0;
    overflow: hidden;
    padding: 6px 10px;
    color: var(--idea-text-primary);
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    transform: translateX(-50%);

    span {
      flex-shrink: 0;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &.is-wrapped span {
      white-space: normal;
      overflow-wrap: anywhere;
    }

    &:not(.is-wrapped) span {
      white-space: nowrap;
    }

    &.is-mixed span {
      color: var(--idea-text-secondary);
    }
  }
}
@media (max-width: 480px) {
  .cell-format-alignment {
    &__fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    &__preview-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }
  }
}
</style>
