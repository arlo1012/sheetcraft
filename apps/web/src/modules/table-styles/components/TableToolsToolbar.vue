<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Eraser, ListMinus, Table2, TableProperties } from "lucide-vue-next";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { createThemedTableStyles, type TableStyleDefinition } from "@idea10/core/table-styles";
import type { PivotTableStyleDefinition } from "@idea10/core/pivot-table-styles";
import type { SheetTable } from "@idea10/core/workbook";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { TableOptionsPatch } from "../table-ui-types";
import TableStyleGallery from "./TableStyleGallery.vue";
import TableStylesMenu from "./TableStylesMenu.vue";

const props = defineProps<{
  table: SheetTable;
  customStyles: readonly TableStyleDefinition[];
  customPivotStyles: readonly PivotTableStyleDefinition[];
  disabled?: boolean;
  editSessionId?: string;
}>();
const emit = defineEmits<{
  rename: [name: string];
  changeOptions: [changes: TableOptionsPatch];
  resize: [];
  removeDuplicates: [];
  convert: [];
  applyStyle: [style: TableStyleDefinition];
  createStyle: [];
  editStyle: [style: TableStyleDefinition];
  createPivotStyle: [];
  editPivotStyle: [style: PivotTableStyleDefinition];
  clearStyle: [];
  settings: [];
}>();
const { t } = useAppI18n();
const name = ref(props.table.name);
watch(
  () => [props.table.id, props.table.name],
  () => {
    name.value = props.table.name;
  },
);
const quickStyles = computed(() => {
  const styles = createThemedTableStyles(props.table.style.accentColor);
  const quick = [styles[0]!, styles[3]!, styles[8]!, styles[12]!, styles[20]!, styles[27]!];
  const selected = quick.findIndex((style) => style.id === props.table.style.id);
  if (selected === -1) quick[0] = props.table.style;
  return quick;
});
function rename(): void {
  if (name.value.trim() !== props.table.name) emit("rename", name.value.trim());
  void nextTick(() => {
    name.value = props.table.name;
  });
}
function onNameKeydown(_value: string | number, context: { e: KeyboardEvent }): void {
  if (context.e.isComposing) return;
  if (context.e.key === "Enter") {
    context.e.preventDefault();
    context.e.stopPropagation();
    rename();
  } else if (context.e.key === "Escape") {
    context.e.preventDefault();
    context.e.stopPropagation();
    name.value = props.table.name;
  }
}
</script>

<template>
  <RibbonToolbar class="table-tools-toolbar" :label="t('tables.tools')">
    <section
      class="table-tools-toolbar__group"
      role="group"
      data-ribbon-group="table-properties"
      :aria-label="t('tables.settings')"
    >
      <label class="table-tools-toolbar__name">
        <span>{{ t("tables.name") }}</span>
        <Input
          v-model="name"
          size="small"
          :disabled="disabled"
          data-table-name
          @enter="onNameKeydown"
          @blur="rename"
          @keydown="onNameKeydown"
        />
      </label>
      <RibbonButton
        variant="tall"
        :disabled="disabled"
        :label="t('tables.resize')"
        :text="t('tables.resize')"
        data-table-action="resize"
        @activate="emit('resize')"
        ><TableProperties
      /></RibbonButton>
      <div class="table-tools-toolbar__stack">
        <RibbonButton
          :disabled="disabled"
          :label="t('dataTools.removeDuplicates.title')"
          :text="t('dataTools.removeDuplicates.title')"
          data-table-action="remove-duplicates"
          @activate="emit('removeDuplicates')"
          ><ListMinus
        /></RibbonButton>
        <RibbonButton
          :disabled="disabled"
          :label="t('tables.convertToRange')"
          :text="t('tables.convertToRange')"
          data-table-action="convert"
          @activate="emit('convert')"
          ><Table2
        /></RibbonButton>
      </div>
    </section>
    <section
      class="table-tools-toolbar__group"
      role="group"
      data-ribbon-group="table-options"
      :aria-label="t('tables.styleOptions')"
    >
      <div class="table-tools-toolbar__options">
        <div>
          <Checkbox
            :checked="table.headerRow"
            :disabled="disabled"
            data-table-option="headerRow"
            @change="emit('changeOptions', { headerRow: Boolean($event) })"
            >{{ t("tables.headerRow") }}</Checkbox
          >
        </div>
        <div>
          <Checkbox
            :checked="table.totalRow"
            :disabled="disabled"
            data-table-option="totalRow"
            @change="emit('changeOptions', { totalRow: Boolean($event) })"
            >{{ t("tables.totalRow") }}</Checkbox
          >
        </div>
        <div>
          <Checkbox
            :checked="table.bandedRows"
            :disabled="disabled"
            data-table-option="bandedRows"
            @change="emit('changeOptions', { bandedRows: Boolean($event) })"
            >{{ t("tables.bandedRows") }}</Checkbox
          >
        </div>
        <div>
          <Checkbox
            :checked="table.filterButton"
            :disabled="disabled || !table.headerRow"
            data-table-option="filterButton"
            @change="emit('changeOptions', { filterButton: Boolean($event) })"
            >{{ t("tables.filterButton") }}</Checkbox
          >
        </div>
        <div>
          <Checkbox
            :checked="table.firstColumn"
            :disabled="disabled"
            data-table-option="firstColumn"
            @change="emit('changeOptions', { firstColumn: Boolean($event) })"
            >{{ t("tables.firstColumn") }}</Checkbox
          >
        </div>
        <div>
          <Checkbox
            :checked="table.lastColumn"
            :disabled="disabled"
            data-table-option="lastColumn"
            @change="emit('changeOptions', { lastColumn: Boolean($event) })"
            >{{ t("tables.lastColumn") }}</Checkbox
          >
        </div>
        <div>
          <Checkbox
            :checked="table.bandedColumns"
            :disabled="disabled"
            data-table-option="bandedColumns"
            @change="emit('changeOptions', { bandedColumns: Boolean($event) })"
            >{{ t("tables.bandedColumns") }}</Checkbox
          >
        </div>
      </div>
    </section>
    <section
      class="table-tools-toolbar__group"
      role="group"
      data-ribbon-group="table-styles"
      :aria-label="t('tableStyles.title')"
    >
      <TableStyleGallery
        :styles="quickStyles"
        :selected-style-id="table.style.id"
        layout="ribbon"
        compact
        :disabled="disabled"
        @select="emit('applyStyle', $event as TableStyleDefinition)"
        @edit="emit('editStyle', $event as TableStyleDefinition)"
      />
      <div class="table-tools-toolbar__stack">
        <TableStylesMenu
          :custom-styles="customStyles"
          :custom-pivot-styles="customPivotStyles"
          :selected-style-id="table.style.id"
          :selected-accent-color="table.style.accentColor"
          :disabled="disabled"
          :has-table="true"
          :edit-session-id="editSessionId"
          @apply="emit('applyStyle', $event)"
          @create="emit('createStyle')"
          @edit="emit('editStyle', $event)"
          @create-pivot="emit('createPivotStyle')"
          @edit-pivot="emit('editPivotStyle', $event)"
          @clear="emit('clearStyle')"
          @manage="emit('settings')"
        />
        <RibbonButton
          :disabled="disabled"
          :label="t('tableStyles.clearStyle')"
          :text="t('tableStyles.clearStyle')"
          data-table-action="clear-style"
          @activate="emit('clearStyle')"
          ><Eraser
        /></RibbonButton>
      </div>
    </section>
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.table-tools-toolbar {
  &__group {
    @include ribbon.columns;
    gap: var(--idea-space-2);
  }
  &__stack {
    @include ribbon.stack;
  }
  &__name {
    @include ribbon.stack;
    width: 116px;
    padding-inline: var(--idea-space-1);
    font-size: var(--idea-font-size-body-small);
  }
  &__options {
    display: grid;
    grid-template-columns: repeat(4, max-content);
    grid-template-rows: repeat(2, var(--ribbon-control-height, 26px));
    align-items: center;
    column-gap: var(--idea-space-3);
    row-gap: var(--ribbon-row-gap, 2px);
  }
}
</style>
