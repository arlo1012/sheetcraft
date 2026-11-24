<script setup lang="ts">
import { computed } from "vue";
import type { CellStylePatch } from "@sheetcraft/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@sheetcraft/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import TextStyleToggleGroup, {
  type TextStyleToggleItem,
  type TextStyleToggleKey,
} from "../../../shared/text-format/TextStyleToggleGroup.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();

function ariaPressed(state: ToggleStyleState): boolean | "mixed" {
  return state === "mixed" ? "mixed" : state === "on";
}

const items = computed<readonly TextStyleToggleItem[]>(() => [
  {
    key: "bold",
    label: t("format.bold"),
    pressed: ariaPressed(props.state.bold),
    disabled: props.disabled,
  },
  {
    key: "italic",
    label: t("format.italic"),
    pressed: ariaPressed(props.state.italic),
    disabled: props.disabled,
  },
  {
    key: "underline",
    label: t("format.underline"),
    pressed: ariaPressed(props.state.underline),
    disabled: props.disabled,
  },
  {
    key: "strike",
    label: t("ribbon.strikethrough"),
    pressed: ariaPressed(props.state.strikethrough),
    disabled: props.disabled,
  },
]);

function onToggle(key: TextStyleToggleKey): void {
  const styleKey = key === "strike" ? "strikethrough" : key;
  const current = props.state[styleKey];
  emit("applyStyle", { [styleKey]: current === "on" ? null : true });
}
</script>

<template>
  <TextStyleToggleGroup
    class="text-format-controls"
    variant="ribbon"
    :items="items"
    :label="t('format.emphasis')"
    @toggle="onToggle"
  />
</template>

<style scoped lang="scss">
.text-format-controls {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
</style>
