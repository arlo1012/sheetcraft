<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, Trash2 } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { useAppI18n } from "../../../shared/i18n";
import OptionList from "../../../shared/option-list/OptionList.vue";
import { createBrowserIdFactory } from "../../../shared/runtime/browser-id-factory";
import {
  BUILTIN_SORT_LISTS,
  parseCustomSortList,
  readCustomSortLists,
  writeCustomSortLists,
  type CustomSortList,
} from "../custom-sort-lists";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initialOrder?: readonly string[];
  }>(),
  { initialOrder: undefined },
);
const emit = defineEmits<{ close: []; apply: [values: string[]] }>();
const { t } = useAppI18n();
const createId = createBrowserIdFactory();
const NEW_LIST_ID = "builtin:new";
const customLists = ref<CustomSortList[]>([]);
const selectedId = ref(NEW_LIST_ID);
const entries = ref("");
let originalLists = "";
const allLists = computed(() => [...BUILTIN_SORT_LISTS, ...customLists.value]);
const listOptions = computed(() => [
  { value: NEW_LIST_ID, label: t("dataTools.customSort.newList") },
  ...allLists.value.map((list) => ({ value: list.id, label: list.values.join(", ") })),
]);
const selectedList = computed(() => allLists.value.find((list) => list.id === selectedId.value));
const parsedEntries = computed(() => parseCustomSortList(entries.value));
const canDelete = computed(() => customLists.value.some((list) => list.id === selectedId.value));
const canConfirm = computed(() =>
  selectedId.value === NEW_LIST_ID ? parsedEntries.value.length > 0 : Boolean(selectedList.value),
);
function selectList(id: string): void {
  selectedId.value = id;
  entries.value = allLists.value.find((list) => list.id === id)?.values.join("\n") ?? "";
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    customLists.value = readCustomSortLists();
    originalLists = JSON.stringify(customLists.value);
    const initial = props.initialOrder;
    const existing =
      initial &&
      allLists.value.find(
        (list) =>
          list.values.length === initial.length &&
          list.values.every((value, index) => value === initial[index]),
      );
    selectList(existing?.id ?? NEW_LIST_ID);
    if (!existing && initial) entries.value = initial.join("\n");
  },
  { immediate: true },
);
function addList(): void {
  if (selectedId.value !== NEW_LIST_ID || !parsedEntries.value.length) return;
  const values = [...parsedEntries.value];
  const existing = allLists.value.find(
    (list) =>
      list.values.length === values.length &&
      list.values.every((value, index) => value === values[index]),
  );
  if (existing) {
    selectList(existing.id);
    return;
  }
  const list = { id: createId("custom-sort-list"), values };
  customLists.value.push(list);
  selectList(list.id);
}
function deleteList(): void {
  if (!canDelete.value) return;
  const index = allLists.value.findIndex((list) => list.id === selectedId.value);
  customLists.value = customLists.value.filter((list) => list.id !== selectedId.value);
  selectList(allLists.value[Math.min(index, allLists.value.length - 1)]?.id ?? NEW_LIST_ID);
}
function apply(): void {
  if (!canConfirm.value) return;
  if (selectedId.value === NEW_LIST_ID) addList();
  const values = selectedList.value?.values;
  if (!values?.length) return;
  if (
    originalLists !== JSON.stringify(customLists.value) &&
    !writeCustomSortLists(customLists.value)
  ) {
    void MessagePlugin.warning(t("dataTools.customSort.storageUnavailable"));
  }
  emit("apply", [...values]);
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.customSort.title')"
    width="min(660px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: !canConfirm }"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="apply"
  >
    <div class="custom-sort-list-dialog">
      <div class="custom-sort-list-dialog__column">
        <span>{{ t("dataTools.customSort.lists") }}</span>
        <OptionList
          class="custom-sort-list-dialog__list"
          :model-value="selectedId"
          :options="listOptions"
          :label="t('dataTools.customSort.lists')"
          overflow="ellipsis"
          item-data-attribute="data-sort-list"
          @select="selectList"
        />
      </div>
      <div class="custom-sort-list-dialog__column">
        <span>{{ t("dataTools.customSort.entries") }}</span>
        <div class="custom-sort-list-dialog__editor">
          <TTextarea
            v-model="entries"
            class="custom-sort-list-dialog__input"
            :readonly="selectedId !== NEW_LIST_ID"
            :aria-label="t('dataTools.customSort.entries')"
            :placeholder="t('dataTools.customSort.placeholder')"
            :autosize="false"
            :style="{ height: '100%', resize: 'none' }"
            data-sort-list-entries
          />
          <div class="custom-sort-list-dialog__actions">
            <TButton
              variant="text"
              :disabled="selectedId !== NEW_LIST_ID || !parsedEntries.length"
              data-sort-list-add
              @click="addList"
              ><Plus :size="15" />{{ t("dataTools.customSort.add") }}</TButton
            >
            <TButton variant="text" :disabled="!canDelete" data-sort-list-delete @click="deleteList"
              ><Trash2 :size="15" />{{ t("dataTools.customSort.delete") }}</TButton
            >
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.custom-sort-list-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  height: min(390px, calc(100dvh - 180px));
  min-height: 0;
  color: var(--idea-text-primary);

  &__column {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
    min-width: 0;
    min-height: 0;
  }
  &__list {
    height: 100%;
    min-height: 0;
  }
  &__editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }
  &__input {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  &__actions {
    display: flex;
    gap: 8px;
  }
}
</style>
