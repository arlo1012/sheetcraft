<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Tabs, TabPanel } from "tdesign-vue-next/es/tabs";
import { Grid2X2, Plus, Trash2 } from "lucide-vue-next";
import type { Workbook, SheetEvaluator } from "@sheetcraft/core/workbook";
import {
  dashboardKinds,
  dashboardStats,
  dashboardRangeFits,
  type DashboardWidget,
} from "@sheetcraft/core/dashboard";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { dashboardFields } from "./dashboard-data";
import DashboardWidgetView from "./DashboardWidgetView.vue";
const props = defineProps<{
  initial: DashboardWidget;
  workbook: Workbook;
  evaluator: SheetEvaluator;
  revision: number;
  error: boolean;
  picking: boolean;
  pick: (sheetId: string, current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ save: [widget: DashboardWidget]; close: [] }>();
const { t, locale } = useAppI18n();
const draft = ref<DashboardWidget>(JSON.parse(JSON.stringify(props.initial)));
const sources = computed(() =>
  [...props.workbook.sheets.values()]
    .filter((s) => !s.dashboard && !s.properties.hidden)
    .map((s) => ({ value: s.id, label: s.name })),
);
const sourceId = ref(draft.value.source?.sheetId || "");
const oldSheet = props.workbook.sheets.get(sourceId.value);
const reference = ref(
  oldSheet && draft.value.source?.range
    ? formatRangeReference(oldSheet.name, draft.value.source.range)
    : "",
);
const tab = ref("data");
const invalid = ref(false);
const fields = computed(() => {
  void props.revision;
  const source = draft.value.source;
  if (!source?.range || !props.workbook.sheets.has(source.sheetId)) return [];
  return dashboardFields(
    source.range,
    props.evaluator.forSheet?.(source.sheetId) ?? props.evaluator,
  );
});
const kinds = computed(() =>
  dashboardKinds.map((value) => ({ value, label: t(`dashboard.${value}`) })),
);
const stats = computed(() =>
  dashboardStats.map((value) => ({ value, label: t(`dashboard.${value}`) })),
);
const sorting = computed(() =>
  (["source", "category", "value"] as const).map((value, i) => ({
    value,
    label: [t("dashboard.sourceOrder"), t("dashboard.category"), t("dashboard.valueOrder")][i]!,
  })),
);
function applyReference() {
  if (draft.value.kind === "text") return true;
  if (!reference.value.trim()) {
    draft.value.source = null;
    invalid.value = false;
    return true;
  }
  const res = resolveRangeReference(
    props.workbook,
    reference.value,
    sourceId.value || sources.value[0]?.value || "",
  );
  const sheet = res && props.workbook.sheets.get(res.sheetId);
  if (
    !res ||
    !sheet ||
    sheet.dashboard ||
    sheet.properties.hidden ||
    !dashboardRangeFits(res.range)
  ) {
    invalid.value = true;
    return false;
  }
  const changed = JSON.stringify(draft.value.source) !== JSON.stringify(res);
  draft.value.source = res;
  sourceId.value = sheet.id;
  reference.value = formatRangeReference(sheet.name, res.range);
  invalid.value = false;
  if (changed) {
    const inRange = (c: number | null) =>
      c !== null && c >= res.range.start.column && c <= res.range.end.column;
    if (!inRange(draft.value.category)) draft.value.category = res.range.start.column;
    for (const measure of draft.value.measures) {
      if (measure.stat !== "records" && !inRange(measure.column))
        measure.column = Math.min(res.range.end.column, res.range.start.column + 1);
    }
  }
  return true;
}
async function pick(id = sourceId.value) {
  if (!id) return;
  const initial = id === draft.value.source?.sheetId ? reference.value : "";
  const result = await props.pick(id, initial);
  if (result !== undefined) {
    reference.value = result;
    applyReference();
  }
}
function statChanged(index: number) {
  const m = draft.value.measures[index]!;
  if (m.stat === "records") m.column = null;
  else if (m.column === null) m.column = fields.value[1]?.value ?? fields.value[0]?.value ?? null;
}
function save() {
  if (!applyReference()) return;
  emit("save", draft.value);
}
</script>
<template>
  <Dialog
    :visible="!picking"
    :header="draft.title || t('dashboard.untitled')"
    width="min(1040px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="t('dashboard.apply')"
    :cancel-btn="t('picture.cancel')"
    @confirm="save"
    @close="emit('close')"
  >
    <div class="widget-dialog">
      <div class="preview" :aria-label="t('dashboard.preview')">
        <DashboardWidgetView
          :key="draft.kind"
          :widget="draft"
          :workbook="workbook"
          :evaluator="evaluator"
          :revision="revision"
        />
      </div>
      <div class="sidebar">
        <Tabs v-model="tab"
          ><TabPanel value="data" :label="t('dashboard.data')" /><TabPanel
            value="style"
            :label="t('dashboard.style')"
        /></Tabs>
        <Form
          label-align="right"
          :label-width="locale === 'zh-CN' ? 82 : 108"
          :prevent-submit-default="true"
        >
          <template v-if="tab === 'data'">
            <FormItem :label="t('dashboard.boardTitle')"
              ><Input
                :aria-label="t('dashboard.boardTitle')"
                v-model="draft.title"
                :maxlength="255"
            /></FormItem>
            <FormItem :label="t('dashboard.type')"
              ><Select :aria-label="t('dashboard.type')" v-model="draft.kind" :options="kinds"
            /></FormItem>
            <FormItem v-if="draft.kind === 'text'" :label="t('dashboard.text')"
              ><Textarea :aria-label="t('dashboard.text')" v-model="draft.text" :maxlength="16384"
            /></FormItem>
            <template v-else>
              <FormItem :label="t('dashboard.sourceSheet')"
                ><Select
                  :aria-label="t('dashboard.sourceSheet')"
                  :value="sourceId"
                  :options="sources"
                  @change="(id) => typeof id === 'string' && pick(id)"
              /></FormItem>
              <FormItem :label="t('dashboard.range')"
                ><div class="range">
                  <Input
                    :aria-label="t('dashboard.range')"
                    v-model="reference"
                    @blur="applyReference"
                  /><Button
                    variant="text"
                    :aria-label="t('dashboard.pick')"
                    :disabled="!sourceId"
                    @click="pick()"
                    ><Grid2X2 :size="15"
                  /></Button></div
              ></FormItem>
              <template v-if="draft.kind !== 'number'">
                <FormItem :label="t('dashboard.category')"
                  ><Select
                    :aria-label="t('dashboard.category')"
                    :value="draft.category ?? undefined"
                    :options="fields"
                    @change="(v) => typeof v === 'number' && (draft.category = v)"
                /></FormItem>
                <FormItem
                  ><Checkbox v-model="draft.group">{{ t("dashboard.group") }}</Checkbox></FormItem
                >
              </template>
              <div v-for="(m, i) in draft.measures" :key="i" class="series">
                <FormItem :label="t('dashboard.stat')"
                  ><div class="range">
                    <Select
                      :aria-label="t('dashboard.stat')"
                      v-model="m.stat"
                      :options="stats"
                      @change="statChanged(i)"
                    /><Button
                      v-if="draft.measures.length > 1"
                      variant="text"
                      :aria-label="t('dashboard.removeSeries')"
                      @click="draft.measures.splice(i, 1)"
                      ><Trash2 :size="14"
                    /></Button></div
                ></FormItem>
                <FormItem v-if="m.stat !== 'records'" :label="t('dashboard.field')"
                  ><Select
                    :aria-label="t('dashboard.field')"
                    :value="m.column ?? undefined"
                    :options="fields"
                    @change="(v) => typeof v === 'number' && (m.column = v)"
                /></FormItem>
              </div>
              <FormItem v-if="draft.kind !== 'number' && draft.kind !== 'pie'"
                ><Button
                  variant="text"
                  :disabled="draft.measures.length >= 16"
                  @click="
                    draft.measures.push({
                      column: fields[1]?.value ?? fields[0]?.value ?? null,
                      stat: 'sum',
                    })
                  "
                  ><Plus :size="14" />{{ t("dashboard.more") }}</Button
                ></FormItem
              >
              <template v-if="draft.kind !== 'number'">
                <FormItem :label="t('dashboard.sort')"
                  ><Select v-model="draft.sort" :options="sorting"
                /></FormItem>
                <FormItem
                  ><Checkbox v-model="draft.descending" :disabled="draft.sort === 'source'">{{
                    t("dashboard.desc")
                  }}</Checkbox></FormItem
                >
              </template>
            </template>
          </template>
          <template v-else>
            <FormItem :label="t('dashboard.width')"
              ><Select
                v-model="draft.width"
                :options="
                  [1, 2, 3].map((value, i) => ({
                    value,
                    label: [t('dashboard.standard'), t('dashboard.double'), t('dashboard.triple')][
                      i
                    ],
                  }))
                "
            /></FormItem>
            <FormItem :label="t('dashboard.height')"
              ><Select
                v-model="draft.height"
                :options="[
                  { value: 1, label: t('dashboard.standard') },
                  { value: 2, label: t('dashboard.double') },
                ]"
            /></FormItem>
            <template v-if="draft.kind !== 'text' && draft.kind !== 'number'">
              <FormItem
                ><Checkbox v-model="draft.legend">{{ t("dashboard.legend") }}</Checkbox></FormItem
              >
              <FormItem
                ><Checkbox v-model="draft.labels">{{ t("dashboard.labels") }}</Checkbox></FormItem
              >
            </template>
          </template>
        </Form>
        <p v-if="invalid || error" role="alert">
          {{ t(invalid ? "dashboard.invalid" : "dashboard.error") }}
        </p>
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.widget-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(285px, 35%);
  height: min(61vh, 600px);
}
.preview {
  min-width: 0;
  min-height: 0;
  padding: 14px;
}
.sidebar {
  border-left: 1px solid var(--sheetcraft-border-subtle);
  padding: 0 12px;
  overflow: auto;
}
.sidebar form {
  padding-top: 14px;
}
.range {
  display: flex;
  align-items: center;
  width: 100%;
}
.series + .series {
  margin-top: 8px;
}
</style>
