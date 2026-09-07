<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import type {
  CellStylePatch,
  HorizontalCellAlignment,
  VerticalCellAlignment,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ state: SelectionCellStyleState; patch: CellStylePatch }>();
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
    <label
      ><span>{{ t("cellFormat.horizontal") }}</span
      ><TSelect
        :model-value="horizontal()"
        :options="horizontalOptions"
        :placeholder="state.horizontalAlign.mixed ? t('format.mixed') : undefined"
        data-cell-format-horizontal
        @change="setHorizontal" /></label
    ><label
      ><span>{{ t("cellFormat.vertical") }}</span
      ><TSelect
        :model-value="vertical()"
        :options="verticalOptions"
        :placeholder="state.verticalAlign.mixed ? t('format.mixed') : undefined"
        data-cell-format-vertical
        @change="setVertical" /></label
    ><TCheckbox
      :model-value="wrapped()"
      :indeterminate="!Object.hasOwn(patch, 'wrapText') && state.wrapText === 'mixed'"
      data-cell-format-wrap
      @change="setWrap"
      >{{ t("cellFormat.wrapText") }}</TCheckbox
    >
  </section>
</template>
<style scoped lang="scss">
.cell-format-alignment {
  display: grid;
  gap: 16px;
  padding: 8px 4px;
  label {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    color: var(--idea-text-secondary);
    font-size: 13px;
  }
}
@media (max-width: 480px) {
  .cell-format-alignment {
    > label,
    &__field,
    &__color,
    &__palette,
    &__preview {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    &__emphasis {
      padding-left: 0;
    }
  }
}
</style>
