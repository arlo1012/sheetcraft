<script setup lang="ts">
import { ListIndentDecrease, ListIndentIncrease } from "lucide-vue-next";
import { MAX_CELL_INDENT, MIN_CELL_INDENT } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

const props = defineProps<{
  state: SelectionCellStyleState["indent"];
  disabled: boolean;
}>();

const emit = defineEmits<{
  adjustIndent: [delta: -1 | 1];
}>();

const { t } = useAppI18n();

function canAdjust(delta: -1 | 1): boolean {
  if (props.disabled || props.state.mixed) {
    return !props.disabled;
  }
  const value = props.state.value ?? MIN_CELL_INDENT;
  return delta < 0 ? value > MIN_CELL_INDENT : value < MAX_CELL_INDENT;
}
</script>

<template>
  <div class="indentation-controls" role="group" :aria-label="t('cellFormat.indent')">
    <RibbonIconAction
      class="indentation-controls__button"
      :disabled="!canAdjust(-1)"
      :label="t('ribbon.decreaseIndent')"
      data-ribbon-action="decrease-indent"
      @activate="emit('adjustIndent', -1)"
    >
      <ListIndentDecrease :size="17" :stroke-width="1.5" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="indentation-controls__button"
      :disabled="!canAdjust(1)"
      :label="t('ribbon.increaseIndent')"
      data-ribbon-action="increase-indent"
      @activate="emit('adjustIndent', 1)"
    >
      <ListIndentIncrease :size="17" :stroke-width="1.5" aria-hidden="true" />
    </RibbonIconAction>
  </div>
</template>

<style scoped lang="scss">
.indentation-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}
</style>
