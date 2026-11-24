<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { CellRange, Workbook } from "@sheetcraft/core/workbook";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../../shared/range-reference/formatRangeReference";
import { analyzePictureNameMatches, type PictureNameMatchStatus } from "../picture-name-matching";
import type { MessageKey } from "../../../shared/i18n";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Button } from "tdesign-vue-next/es/button";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { BaseTable, type BaseTableCol } from "tdesign-vue-next/es/table";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import DialogFooter from "../../../shared/dialog/DialogFooter.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import type { PictureBatchArrangement, PictureBatchInsertion } from "../picture-batch-layout";

const props = defineProps<{
  fileNames: readonly string[];
  mode: "cell" | "floating";
  busy: boolean;
  workbook: Workbook;
  sheetId: string;
  initialRange: CellRange;
  revision: number;
  error?: string;
}>();
const emit = defineEmits<{ confirm: [payload: PictureBatchInsertion]; close: [] }>();
const { t, locale } = useAppI18n();
const order = ref(props.fileNames.map((_, index) => index));
const arrangement = ref<PictureBatchArrangement>(props.mode === "cell" ? "vertical" : "cascade");
const wrapEnabled = ref(false);
const wrapAfter = ref(3);
const namesEnabled = ref(false);
const namePlacement = ref<"before" | "after">("after");
const matchEnabled = ref(false);
const matchActive = computed(() => matchEnabled.value && arrangement.value !== "cascade");
const nameRange = ref(
  formatRangeReference(props.workbook.sheets.get(props.sheetId)!.name, props.initialRange),
);
watch(matchEnabled, (value) => {
  if (value) namePlacement.value = "before";
});
const nameMatches = computed(() => {
  void props.revision;
  if (!matchActive.value || arrangement.value === "cascade") return;
  const selected = resolveRangeReference(props.workbook, nameRange.value, props.sheetId);
  if (!selected || selected.sheetId !== props.sheetId) return;
  try {
    return {
      range: selected.range,
      plan: analyzePictureNameMatches(
        props.workbook,
        props.sheetId,
        order.value.map((index) => props.fileNames[index]!),
        selected.range,
        arrangement.value,
        namePlacement.value,
      ),
    };
  } catch {
    return;
  }
});
const validMatches = computed(
  () =>
    !matchActive.value ||
    (!!nameMatches.value &&
      !nameMatches.value.plan.hasConflicts &&
      nameMatches.value.plan.matches.length > 0),
);
const matchStatusKeys: Record<PictureNameMatchStatus, MessageKey> = {
  matched: "image.batchMatchFound",
  unmatched: "image.batchMatchMissing",
  duplicateFile: "image.batchMatchDuplicateFile",
  duplicateName: "image.batchMatchDuplicateName",
  invalidTarget: "image.batchMatchInvalidTarget",
};
const rowHeightEnabled = ref(false);
const rowHeight = ref(100);
const validRowHeight = computed(
  () =>
    !rowHeightEnabled.value ||
    arrangement.value === "cascade" ||
    (Number.isInteger(rowHeight.value) && rowHeight.value >= 16 && rowHeight.value <= 512),
);
const validWrap = computed(
  () =>
    matchActive.value ||
    !wrapEnabled.value ||
    arrangement.value === "cascade" ||
    (Number.isInteger(wrapAfter.value) && wrapAfter.value >= 1 && wrapAfter.value <= 100),
);
const wrapLabel = computed(() =>
  t(arrangement.value === "horizontal" ? "image.batchPerRow" : "image.batchPerColumn"),
);
const rows = computed(() =>
  order.value.map((index, rowIndex) => {
    const entry = nameMatches.value?.plan.entries[rowIndex];
    return {
      index,
      name: props.fileNames[index],
      match: entry
        ? entry.status === "matched"
          ? formatCellAddress(entry.pictureAddress!)
          : t(matchStatusKeys[entry.status])
        : "—",
    };
  }),
);
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "name", title: t("image.batchFileName"), ellipsis: true },
  ...(matchActive.value
    ? [{ colKey: "match", title: t("image.batchMatchResult"), width: 160 }]
    : []),
  { colKey: "actions", title: t("image.batchOrder"), width: 190 },
]);
function move(index: number, delta: number): void {
  const next = index + delta;
  if (props.busy || next < 0 || next >= order.value.length) return;
  const value = order.value.splice(index, 1)[0]!;
  order.value.splice(next, 0, value);
}
function confirm(): void {
  if (
    props.busy ||
    !order.value.length ||
    !validWrap.value ||
    !validRowHeight.value ||
    !validMatches.value
  )
    return;
  emit("confirm", {
    ...(arrangement.value !== "cascade" && (namesEnabled.value || matchActive.value)
      ? { namePlacement: namePlacement.value }
      : {}),
    ...(arrangement.value !== "cascade" && rowHeightEnabled.value
      ? { rowHeight: rowHeight.value }
      : {}),
    ...(matchActive.value && nameMatches.value
      ? {
          nameMatch: {
            range: nameMatches.value.range,
            fingerprint: nameMatches.value.plan.fingerprint,
          },
        }
      : {}),
    order: [...order.value],
    arrangement: arrangement.value,
    ...(wrapEnabled.value && !matchActive.value && arrangement.value !== "cascade"
      ? { wrapAfter: wrapAfter.value }
      : {}),
  });
}
</script>

<template>
  <Dialog
    :visible="true"
    :header="t('image.batchInsert')"
    :aria-label="t('image.batchInsert')"
    role="dialog"
    aria-modal="true"
    width="min(680px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{
      content: matchActive
        ? t('image.batchMatchInsert', { count: nameMatches?.plan.matches.length ?? 0 })
        : t('drawing.insert'),
      disabled: busy || !order.length || !validWrap || !validRowHeight || !validMatches,
      loading: busy,
    }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="picture-batch-insert">
      <p v-if="!matchActive">
        {{ t(mode === "cell" ? "image.batchCellHint" : "image.batchFloatingHint") }}
      </p>
      <Form
        class="sheetcraft-form-grid"
        label-align="left"
        :label-width="locale === 'zh-CN' ? 132 : 176"
        :prevent-submit-default="true"
      >
        <FormItem :label="t('image.batchArrangement')"
          ><RadioGroup
            v-model="arrangement"
            :disabled="busy"
            :aria-label="t('image.batchArrangement')"
          >
            <Radio value="vertical">{{ t("image.batchVertical") }}</Radio>
            <Radio value="horizontal">{{ t("image.batchHorizontal") }}</Radio>
            <Radio v-if="mode === 'floating'" value="cascade">{{ t("image.batchCascade") }}</Radio>
          </RadioGroup></FormItem
        >
        <template v-if="arrangement !== 'cascade'">
          <FormItem
            ><Checkbox v-model="matchEnabled" :disabled="busy">{{
              t("image.batchMatchNames")
            }}</Checkbox></FormItem
          >
          <FormItem v-if="matchActive" :label="t('image.batchMatchRange')"
            ><div class="picture-batch-insert__match-range">
              <RangeReferenceInput
                v-model="nameRange"
                :show-picker="false"
                :disabled="busy"
                :label="t('image.batchMatchRange')"
                placeholder="A1:A20"
              />
              <p>
                {{
                  t(
                    arrangement === "horizontal"
                      ? "image.batchMatchRowHint"
                      : "image.batchMatchColumnHint",
                  )
                }}
              </p>
              <p v-if="!nameMatches" role="alert">{{ t("image.batchMatchInvalidRange") }}</p>
            </div></FormItem
          >
        </template>
        <FormItem v-if="arrangement !== 'cascade' && !matchActive">
          <template #label
            ><Checkbox v-model="wrapEnabled" :disabled="busy">{{ wrapLabel }}</Checkbox></template
          >
          <InputNumber
            v-model="wrapAfter"
            theme="column"
            class="picture-batch-insert__count sheetcraft-input-number--persistent-controls"
            :min="1"
            :max="100"
            :decimal-places="0"
            :disabled="busy || !wrapEnabled"
            v-native-control="{ attributes: { 'aria-label': wrapLabel } }"
          />
        </FormItem>
        <template v-if="arrangement !== 'cascade'">
          <FormItem>
            <template #label
              ><Checkbox v-model="rowHeightEnabled" :disabled="busy">{{
                t("image.batchRowHeight")
              }}</Checkbox></template
            >
            <InputNumber
              v-model="rowHeight"
              theme="column"
              class="picture-batch-insert__count sheetcraft-input-number--persistent-controls"
              :min="16"
              :max="512"
              :decimal-places="0"
              :disabled="busy || !rowHeightEnabled"
              v-native-control="{ attributes: { 'aria-label': t('image.batchRowHeight') } }"
            />
            <span>px</span>
          </FormItem>
          <FormItem>
            <template #label
              ><span v-if="matchActive">{{ t("image.batchExistingNamePosition") }}</span>
              <Checkbox v-else v-model="namesEnabled" :disabled="busy">{{
                t("image.batchShowNames")
              }}</Checkbox></template
            >
            <RadioGroup
              v-model="namePlacement"
              :aria-label="t('image.batchExistingNamePosition')"
              :disabled="busy || (!namesEnabled && !matchActive)"
            >
              <Radio value="before">{{
                t(arrangement === "horizontal" ? "image.batchNameAbove" : "image.batchNameLeft")
              }}</Radio>
              <Radio value="after">{{
                t(arrangement === "horizontal" ? "image.batchNameBelow" : "image.batchNameRight")
              }}</Radio>
            </RadioGroup>
          </FormItem>
          <p v-if="mode === 'floating' && (rowHeightEnabled || namesEnabled || matchActive)">
            {{ t("image.batchFitCellsHint") }}
          </p>
        </template>
      </Form>
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
    </div>
    <template #footer>
      <DialogFooter
        :status="
          error ||
          (matchActive && nameMatches
            ? t('image.batchMatchSummary', {
                matched: nameMatches.plan.matches.length,
                skipped: nameMatches.plan.entries.filter((entry) => entry.status === 'unmatched')
                  .length,
              })
            : t('image.batchCount', { count: order.length }))
        "
        :theme="error ? 'error' : 'info'"
      >
        <Button theme="default" variant="base" @click="emit('close')">{{
          t("picture.cancel")
        }}</Button>
        <Button
          theme="primary"
          variant="base"
          :disabled="busy || !order.length || !validWrap || !validRowHeight || !validMatches"
          :loading="busy"
          @click="confirm"
          >{{
            matchActive
              ? t("image.batchMatchInsert", { count: nameMatches?.plan.matches.length ?? 0 })
              : t("drawing.insert")
          }}</Button
        >
      </DialogFooter>
    </template>
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
  &__match-range {
    display: grid;
    gap: 8px;
    width: 100%;
  }
  &__table {
    height: min(280px, 40vh);
    min-height: 0;
  }
  &__actions {
    display: flex;
    gap: 4px;
  }
  &__count {
    width: 100px;
  }
}
</style>
