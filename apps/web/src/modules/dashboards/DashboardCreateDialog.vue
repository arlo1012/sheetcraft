<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  createSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import { emptyDashboard, newDashboardWidget } from "@sheetcraft/core/dashboard";
import { useAppI18n } from "../../shared/i18n";
import { dashboardSnapshotSvg } from "./dashboard-snapshot";
defineProps<{ error: boolean }>();
const emit = defineEmits<{ create: [snapshot: boolean, skip: boolean]; close: [] }>();
const { t } = useAppI18n();
const snapshot = ref(localStorage.getItem("sheetcraft.dashboard.snapshot") !== "0"),
  skip = ref(false);
const example = computed(() => {
  const workbook = createWorkbook({ id: "dashboard-preview", sheetId: "data" });
  const source = getActiveSheet(workbook);
  const values = [
    ["Q", "A", "B"],
    ["Q1", 32, 20],
    ["Q2", 48, 35],
    ["Q3", 40, 29],
    ["Q4", 56, 39],
  ];
  values.forEach((r, row) =>
    r.forEach((v, column) =>
      setCellContent(source, { row, column }, { kind: "literal", value: v }),
    ),
  );
  const sheet = createSheet("Dashboard", "dashboard");
  insertSheet(workbook, sheet);
  sheet.dashboard = emptyDashboard();
  sheet.dashboard.widgets = (["pie", "column", "line", "number"] as const).map((kind, i) => {
    const w = newDashboardWidget(String(i), kind, t(`dashboard.${kind}`));
    w.width = i === 1 || i === 2 ? 2 : 1;
    w.source = {
      sheetId: source.id,
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
    };
    w.category = 0;
    w.measures = [{ column: 1, stat: "sum" }];
    if (kind === "column") w.measures.push({ column: 2, stat: "sum" });
    return w;
  });
  const { svg } = dashboardSnapshotSvg(workbook, sheet, {
    records: t("dashboard.records"),
    blank: t("dashboard.blank"),
    noSource: t("dashboard.noSource"),
  });
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
});
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('dashboard.create')"
    width="min(470px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="t('dashboard.createBtn')"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('create', snapshot, skip)"
    @close="emit('close')"
  >
    <div class="create-dashboard">
      <img :src="example" :alt="t('dashboard.preview')" />
      <Checkbox v-model="snapshot">{{ t("dashboard.snapshot") }}</Checkbox>
      <Checkbox v-model="skip">{{ t("dashboard.skip") }}</Checkbox>
      <span v-if="error" role="alert">{{ t("dashboard.error") }}</span>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.create-dashboard {
  display: grid;
  justify-items: start;
  gap: 14px;
}
img {
  width: 100%;
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: 4px;
}
</style>
