<script setup lang="ts">
import type { TableStyleDefinition } from "@idea10/core/table-styles";
import type { PivotTableStyleDefinition } from "@idea10/core/pivot-table-styles";
import TableStylesMenu from "../../table-styles/components/TableStylesMenu.vue";
import { useAppI18n } from "../../../shared/i18n";
import ConditionalFormattingMenu, {
  type ConditionalFormatQuickRule,
} from "../../conditional-formatting/components/ConditionalFormattingMenu.vue";

defineProps<{
  disabled?: boolean;
  editSessionId?: string;
  tableStyles?: readonly TableStyleDefinition[];
  pivotTableStyles?: readonly PivotTableStyleDefinition[];
  selectedTableStyleId?: string;
  selectedTableStyleColor?: string;
  hasTable?: boolean;
}>();
const emit = defineEmits<{
  createConditionalFormat: [kind: ConditionalFormatQuickRule];
  manageConditionalFormats: [];
  clearConditionalFormats: [scope: "selection" | "sheet"];
  applyTableStyle: [style: TableStyleDefinition];
  createTableStyle: [];
  editTableStyle: [style: TableStyleDefinition];
  createPivotTableStyle: [];
  editPivotTableStyle: [style: PivotTableStyleDefinition];
  clearTableStyle: [];
  manageTable: [];
}>();

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-styles-group"
    data-ribbon-group="styles"
    role="group"
    :aria-label="t('format.styleRuleTools')"
  >
    <div class="home-styles-group__row" data-ribbon-row="1">
      <TableStylesMenu
        :disabled="disabled"
        :edit-session-id="editSessionId"
        :custom-styles="tableStyles"
        :custom-pivot-styles="pivotTableStyles"
        :selected-style-id="selectedTableStyleId"
        :selected-accent-color="selectedTableStyleColor"
        :has-table="hasTable"
        @apply="emit('applyTableStyle', $event)"
        @create="emit('createTableStyle')"
        @edit="emit('editTableStyle', $event)"
        @create-pivot="emit('createPivotTableStyle')"
        @edit-pivot="emit('editPivotTableStyle', $event)"
        @clear="emit('clearTableStyle')"
        @manage="emit('manageTable')"
      />
    </div>
    <div class="home-styles-group__row" data-ribbon-row="2">
      <ConditionalFormattingMenu
        :disabled="disabled"
        :edit-session-id="editSessionId"
        @create="emit('createConditionalFormat', $event)"
        @manage="emit('manageConditionalFormats')"
        @clear="emit('clearConditionalFormats', $event)"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-styles-group {
  @include ribbon.compact;

  &__row {
    @include ribbon.row;
  }
}
</style>
