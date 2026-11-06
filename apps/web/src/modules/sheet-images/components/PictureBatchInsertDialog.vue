<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { BaseTable, type BaseTableCol } from "tdesign-vue-next/es/table";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { PictureBatchArrangement, PictureBatchInsertion } from "../picture-batch-layout";

const props = defineProps<{
  fileNames: readonly string[];
  mode: "cell" | "floating";
  busy: boolean;
}>();
const emit = defineEmits<{ confirm: [payload: PictureBatchInsertion]; close: [] }>();
const { t } = useAppI18n();
const order = ref(props.fileNames.map((_, index) => index));
const arrangement = ref<PictureBatchArrangement>(props.mode === "cell" ? "vertical" : "cascade");
const wrapEnabled = ref(false);
const wrapAfter = ref(3);
const validWrap = computed(
  () =>
    !wrapEnabled.value ||
    arrangement.value === "cascade" ||
    (Number.isInteger(wrapAfter.value) && wrapAfter.value >= 1 && wrapAfter.value <= 100),
);
const wrapLabel = computed(() =>
  t(arrangement.value === "horizontal" ? "image.batchPerRow" : "image.batchPerColumn"),
);
const rows = computed(() => order.value.map((index) => ({ index, name: props.fileNames[index] })));
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "name", title: t("image.batchFileName"), ellipsis: true },
  { colKey: "actions", title: t("image.batchOrder"), width: 190 },
]);
function move(index: number, delta: number): void {
  const next = index + delta;
  if (props.busy || next < 0 || next >= order.value.length) return;
  const value = order.value.splice(index, 1)[0]!;
  order.value.splice(next, 0, value);
}
function confirm(): void {
  if (props.busy || !order.value.length || !validWrap.value) return;
  emit("confirm", {
    order: [...order.value],
    arrangement: arrangement.value,
    ...(wrapEnabled.value && arrangement.value !== "cascade" ? { wrapAfter: wrapAfter.value } : {}),
  });
}
</script>

<template>
  <Dialog
    :visible="true"
    :header="t('image.batchInsert')"
    width="min(680px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{
      content: t('drawing.insert'),
      disabled: busy || !order.length || !validWrap,
      loading: busy,
    }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="picture-batch-insert">
      <p>{{ t(mode === "cell" ? "image.batchCellHint" : "image.batchFloatingHint") }}</p>
      <RadioGroup v-model="arrangement" :disabled="busy" :aria-label="t('image.batchArrangement')">
        <Radio value="vertical">{{ t("image.batchVertical") }}</Radio>
        <Radio value="horizontal">{{ t("image.batchHorizontal") }}</Radio>
        <Radio v-if="mode === 'floating'" value="cascade">{{ t("image.batchCascade") }}</Radio>
      </RadioGroup>
      <div
        v-if="arrangement !== 'cascade'"
        class="picture-batch-insert__wrap"
        role="group"
        :aria-label="wrapLabel"
      >
        <Checkbox v-model="wrapEnabled" :disabled="busy">{{ wrapLabel }}</Checkbox>
        <InputNumber
          v-model="wrapAfter"
          theme="column"
          class="picture-batch-insert__count sheetcraft-input-number--persistent-controls"
          :min="1"
          :max="100"
          :decimal-places="0"
          :disabled="busy || !wrapEnabled"
          :aria-label="wrapLabel"
        />
      </div>
      <div class="picture-batch-insert__table">
        <TableHeightWrapper v-slot="{ height }">
          <BaseTable
            :data="rows"
            :columns="columns"
            :height="height"
            row-key="index"
            size="small"
            class="sheetcraft-table--mini"
            table-layout="fixed"
          >
            <template #actions="{ rowIndex }">
              <div class="picture-batch-insert__actions">
                <Button
                  size="small"
                  theme="default"
                  variant="text"
                  :disabled="busy || rowIndex === 0"
                  @click="move(rowIndex, -1)"
                  >{{ t("image.batchUp") }}</Button
                >
                <Button
                  size="small"
                  theme="default"
                  variant="text"
                  :disabled="busy || rowIndex === order.length - 1"
                  @click="move(rowIndex, 1)"
                  >{{ t("image.batchDown") }}</Button
                >
                <Button
                  size="small"
                  theme="default"
                  variant="text"
                  :disabled="busy"
                  @click="order.splice(rowIndex, 1)"
                  >{{ t("image.batchRemove") }}</Button
                >
              </div>
            </template>
          </BaseTable>
        </TableHeightWrapper>
      </div>
      <p>{{ t("image.batchCount", { count: order.length }) }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.picture-batch-insert {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__table {
    height: min(280px, 40vh);
    min-height: 0;
  }
  &__actions {
    display: flex;
    gap: 4px;
  }
  &__wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  &__count {
    width: 100px;
  }
}
</style>
