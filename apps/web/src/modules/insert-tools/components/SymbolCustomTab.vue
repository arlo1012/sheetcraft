<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import { FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { PrimaryTable } from "tdesign-vue-next/es/table";
import type {
  PrimaryTableCol,
  RowEventContext,
  TableRowAttributes,
  TableRowData,
} from "tdesign-vue-next/es/table/type";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import {
  captureSymbolShortcut,
  symbolIdentity,
  validateSymbolShortcut,
  type CustomSymbol,
} from "../symbols/symbol-preferences";

const props = defineProps<{
  visible: boolean;
  custom: readonly CustomSymbol[];
  customIndex: number;
  localFontLabels: Readonly<Record<string, string>>;
}>();

const emit = defineEmits<{
  "update:customIndex": [index: number];
  insert: [];
  toggleVisible: [index: number, visible: boolean];
  move: [delta: -1 | 1];
  remove: [];
  requestReset: [];
  saveShortcut: [shortcut: string | undefined];
}>();

const { t } = useAppI18n();
const shortcutInput = ref("");
const shortcutMessage = ref<MessageKey>();
const customEntry = computed(() => props.custom[props.customIndex]);

watch(
  () =>
    [
      customEntry.value ? symbolIdentity(customEntry.value) : undefined,
      customEntry.value?.shortcut,
    ] as const,
  ([identity, shortcut], previous) => {
    shortcutInput.value = shortcut ?? "";
    if (identity !== previous?.[0]) shortcutMessage.value = undefined;
  },
  { immediate: true },
);

function captureShortcut(event: KeyboardEvent): void {
  if (event.key === "Tab") return;
  event.preventDefault();
  event.stopPropagation();
  const value = captureSymbolShortcut(event);
  if (value) {
    shortcutInput.value = value;
    shortcutMessage.value = undefined;
  }
}

function assignShortcut(clear = false): void {
  const entry = customEntry.value;
  if (!entry) return;
  const issue = clear
    ? undefined
    : validateSymbolShortcut(shortcutInput.value, props.custom, symbolIdentity(entry));
  const errors = {
    modifier: "symbolTools.shortcutModifier",
    unsupported: "symbolTools.shortcutUnsupported",
    reserved: "symbolTools.shortcutReserved",
    duplicate: "symbolTools.shortcutDuplicate",
  } as const;
  if (issue) {
    shortcutMessage.value = errors[issue];
    return;
  }
  emit("saveShortcut", clear ? undefined : shortcutInput.value);
  if (clear) shortcutInput.value = "";
  shortcutMessage.value = "symbolTools.shortcutSaved";
}

const customRows = computed(() => props.custom.map((entry, index) => ({ index, entry })));
const customColumns = computed<PrimaryTableCol[]>(() => [
  { colKey: "symbol", title: t("symbolTools.custom"), width: "50%" },
  { colKey: "shortcut", title: t("symbolTools.shortcut"), width: "50%" },
]);
const customRowAttributes: TableRowAttributes<TableRowData> = ({ rowIndex }) => ({
  role: "option",
  "aria-selected": String(props.customIndex === rowIndex),
  "data-row-index": String(rowIndex),
  tabindex: props.customIndex === rowIndex ? "0" : "-1",
});

function selectCustomRows(keys: Array<string | number>): void {
  if (typeof keys[0] === "number") emit("update:customIndex", keys[0]);
}

function activateCustomRow({ row, e }: RowEventContext<TableRowData>): void {
  if (e.target instanceof Element && e.target.closest("input, label, button")) return;
  emit("update:customIndex", Number(row.index));
  emit("insert");
}

function onCustomListKey(event: KeyboardEvent): void {
  if ((event.target as HTMLElement).tagName === "INPUT") return;
  const count = props.custom.length;
  if (!count) return;
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : Math.max(
              0,
              Math.min(count - 1, props.customIndex + (event.key === "ArrowDown" ? 1 : -1)),
            );
    emit("update:customIndex", nextIndex);
    const row = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
      `[data-row-index="${nextIndex}"]`,
    );
    row?.focus({ preventScroll: true });
    row?.scrollIntoView?.({ block: "nearest" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    emit("insert");
  }
}

defineExpose({
  clearShortcutInput: () => {
    shortcutInput.value = "";
  },
});
</script>

<template>
  <section
    v-show="visible"
    class="symbol-dialog__page symbol-dialog__page--fill"
    :aria-label="t('symbolTools.custom')"
  >
    <div
      class="symbol-dialog__custom-list"
      role="listbox"
      :aria-label="t('symbolTools.custom')"
      @keydown="onCustomListKey"
    >
      <TableHeightWrapper v-slot="{ height }">
        <PrimaryTable
          class="sheetcraft-table--mini"
          row-key="index"
          :data="customRows"
          :columns="customColumns"
          :row-attributes="customRowAttributes"
          :active-row-keys="[customIndex]"
          active-row-type="single"
          :disable-space-inactive-row="true"
          :height="height"
          :bordered="false"
          size="small"
          table-layout="fixed"
          hover
          :empty="t('symbolTools.emptyCustom')"
          @active-change="selectCustomRows"
          @row-dblclick="activateCustomRow"
        >
          <template #symbol="{ row }">
            <span class="symbol-dialog__custom-symbol">
              <span @click.stop @dblclick.stop>
                <Checkbox
                  :checked="row.entry.visible"
                  :aria-label="`${t('symbolTools.visible')}: ${row.entry.text}`"
                  @change="emit('toggleVisible', row.index, !!$event)"
                />
              </span>
              <span
                class="symbol-dialog__list-glyph"
                :title="
                  row.entry.fontFamily
                    ? (localFontLabels[row.entry.fontFamily] ?? row.entry.fontFamily)
                    : t('symbolTools.inherited')
                "
                :style="{ fontFamily: row.entry.fontFamily }"
                >{{ /\s/u.test(row.entry.text) ? "␣" : row.entry.text }}</span
              >
            </span>
          </template>
          <template #shortcut="{ row }"
            ><kbd>{{ row.entry.shortcut }}</kbd></template
          >
        </PrimaryTable>
      </TableHeightWrapper>
    </div>
    <div class="symbol-dialog__shortcut">
      <FormItem class="symbol-dialog__field" :label="t('symbolTools.shortcut')"
        ><Input
          v-native-control="{ attributes: { 'aria-label': t('symbolTools.shortcut') } }"
          size="small"
          :value="shortcutInput"
          readonly
          :placeholder="t('symbolTools.shortcutCapture')"
          @keydown="(_value, context) => captureShortcut(context.e)" /></FormItem
      ><Button
        theme="default"
        variant="base"
        :disabled="!customEntry || !shortcutInput"
        @click="assignShortcut()"
        >{{ t("symbolTools.assignShortcut") }}</Button
      ><Button
        theme="default"
        variant="text"
        :disabled="!customEntry?.shortcut"
        @click="assignShortcut(true)"
        >{{ t("symbolTools.removeShortcut") }}</Button
      >
    </div>
    <div v-if="shortcutMessage" role="status" class="symbol-dialog__hint">
      {{ t(shortcutMessage) }}
    </div>
    <div class="symbol-dialog__custom-actions">
      <Button
        theme="default"
        variant="base"
        :disabled="customIndex <= 0"
        @click="emit('move', -1)"
        >{{ t("symbolTools.moveUp") }}</Button
      ><Button
        theme="default"
        variant="base"
        :disabled="customIndex >= custom.length - 1"
        @click="emit('move', 1)"
        >{{ t("symbolTools.moveDown") }}</Button
      ><Button theme="default" variant="base" :disabled="!customEntry" @click="emit('remove')">{{
        t("symbolTools.remove")
      }}</Button
      ><Button theme="default" variant="base" @click="emit('requestReset')">{{
        t("symbolTools.reset")
      }}</Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.symbol-dialog {
  &__page {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    min-width: 0;
    > * {
      flex-shrink: 0;
    }
    &--fill {
      flex: 1 0 280px;
    }
  }
  &__field {
    min-width: 0;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    margin: 0;
    overflow-wrap: anywhere;
  }
  &__custom-symbol {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  &__custom-list {
    flex: 1 1 0;
    min-height: 160px;
    overflow: hidden;
  }
  &__list-glyph {
    flex: 0 0 36px;
    max-width: 64px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    font-size: 23px;
    line-height: 28px;
  }
  &__shortcut {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    > .symbol-dialog__field {
      flex: 1 1 240px;
    }
  }
  &__custom-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    > :last-child {
      margin-inline-start: auto;
    }
  }
}

@media (max-width: 580px) {
  .symbol-dialog__custom-actions > :last-child {
    margin-inline-start: 0;
  }
}
</style>
