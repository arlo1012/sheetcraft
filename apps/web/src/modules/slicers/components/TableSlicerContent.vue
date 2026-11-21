<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { FilterX, ListChecks } from "lucide-vue-next";
import type { Sheet } from "@sheetcraft/core/workbook";
import type { SheetSlicerDrawing } from "@sheetcraft/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import { tableSlicerContext } from "../useTableSlicers";
const props = defineProps<{ drawing: SheetSlicerDrawing; sheet: Sheet; revision: number }>();
const { t } = useAppI18n(),
  multi = ref(false),
  context = inject(tableSlicerContext, undefined);
const state = computed(() => {
  void props.revision;
  return context?.state(props.sheet, props.drawing);
});
const editable = computed(() => {
  void props.revision;
  return context?.editable(props.sheet, props.drawing);
});
</script>
<template>
  <section class="table-slicer" :aria-label="state?.caption ?? drawing.name">
    <header>
      <strong>{{ state?.caption ?? drawing.name }}</strong>
      <div class="table-slicer__actions" @pointerdown.stop @dblclick.stop @keydown.stop>
        <button
          type="button"
          :title="t('tables.slicerMultiple')"
          :aria-pressed="multi"
          :disabled="!editable || !state"
          @click.stop="multi = !multi"
        >
          <ListChecks />
        </button>
        <button
          type="button"
          :title="t('tables.slicerClear')"
          :disabled="!editable || !state?.filtered"
          @click.stop="context?.select(sheet, drawing)"
        >
          <FilterX />
        </button>
      </div>
    </header>
    <div
      v-if="state"
      class="table-slicer__items"
      @pointerdown.stop
      @dblclick.stop
      @keydown.stop
      @wheel.stop
    >
      <button
        v-for="item in state.items"
        :key="item.key"
        type="button"
        :aria-pressed="item.selected"
        :class="{ 'no-data': !item.available }"
        :disabled="!editable"
        @click.stop="
          context?.select(sheet, drawing, item.key, multi || $event.ctrlKey || $event.metaKey)
        "
      >
        {{
          item.value.kind === "blank"
            ? t("tables.slicerBlank")
            : item.value.kind === "error"
              ? item.value.code
              : String(item.value.value)
        }}
      </button>
    </div>
    <span v-else>{{ t("tables.slicerMissing") }}</span>
  </section>
</template>
<style scoped lang="scss">
.table-slicer {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #5b9bd5;
  background: #fff;
  padding: 4px;
  color: #222;
  font:
    13px/1.3 Arial,
    sans-serif;
  pointer-events: auto;
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    border-bottom: 1px solid #5b9bd5;
    padding: 0 2px 3px;
    cursor: move;
  }
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  &__actions {
    display: flex;
    gap: 2px;
    button {
      display: grid;
      place-items: center;
      padding: 2px;
      border: 0;
      background: transparent;
      color: inherit;
    }
    svg {
      width: 15px;
      height: 15px;
    }
    button[aria-pressed="true"] {
      background: #bedaf2;
    }
    button:disabled {
      opacity: 0.4;
    }
  }
  &__items {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
    overflow: auto;
    button {
      border: 1px solid #aac9e4;
      border-radius: 3px;
      background: #fff;
      padding: 2px 5px;
      text-align: start;
    }
    button[aria-pressed="true"] {
      background: #c6e0f4;
    }
    button.no-data {
      color: #777;
      background: #eee;
    }
  }
}
</style>
