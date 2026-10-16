<script setup lang="ts">
import { computed } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { XlsxCompatibilityReport } from "../xlsxWorkerProtocol";
import type { XlsxConfirmation, XlsxFeedback } from "../useWorkbookXlsxActions";

const props = defineProps<{
  busy: boolean;
  confirmation?: XlsxConfirmation;
  feedback?: XlsxFeedback;
  report?: XlsxCompatibilityReport;
}>();
const emit = defineEmits<{ confirm: []; cancel: []; dismiss: [] }>();
const { t } = useAppI18n();
const issueLabels: Readonly<Record<string, MessageKey>> = {
  "archive-invalid": "xlsx.report.issues.archiveInvalid",
  "archive-limit": "xlsx.report.issues.archiveLimit",
  "archive-encrypted": "xlsx.report.issues.archiveEncrypted",
  "archive-unsupported-compression": "xlsx.report.issues.archiveCompression",
  "archive-unsafe-path": "xlsx.report.issues.archivePath",
  "macro-content": "xlsx.report.issues.macroContent",
  "drawing-or-media": "xlsx.report.issues.drawingOrMedia",
  "external-content": "xlsx.report.issues.externalContent",
  "chart-cache-normalized": "xlsx.report.issues.chartCacheNormalized",
  "formula-cache-discarded": "xlsx.report.issues.formulaCacheDiscarded",
  "formula-not-calculated": "xlsx.report.issues.formulaNotCalculated",
  "filter-omitted": "xlsx.report.issues.filterOmitted",
  "filter-table-normalized": "xlsx.report.issues.filterTableNormalized",
  "table-totals-numeric-constant": "xlsx.report.issues.numericTableTotals",
  "advanced-filter-criteria-omitted": "xlsx.report.issues.advancedFilterCriteriaOmitted",
  "image-omitted": "xlsx.report.issues.imageOmitted",
  "style-omitted": "xlsx.report.issues.styleOmitted",
  "number-format-omitted": "xlsx.report.issues.numberFormatOmitted",
  "number-format-degraded": "xlsx.report.issues.numberFormatDegraded",
  "dimension-approximated": "xlsx.report.issues.dimensionApproximated",
  "picture-geometry-approximated": "xlsx.report.issues.pictureGeometryApproximated",
  "date-normalized": "xlsx.report.issues.dateNormalized",
  "cell-value-omitted": "xlsx.report.issues.cellValueOmitted",
  "feature-omitted": "xlsx.report.issues.featureOmitted",
};
const issues = computed(() => props.report?.issues ?? []);
const hasWarnings = computed(() => issues.value.some((issue) => issue.severity === "warning"));
function issueLabel(code: string): string {
  const key = Object.hasOwn(issueLabels, code) ? issueLabels[code] : undefined;
  return key ? t(key) : t("xlsx.report.unknownIssue", { code });
}
const dialogContent = computed(() => {
  if (props.confirmation === "import") {
    return {
      kind: "confirmation" as const,
      theme: "warning" as const,
      header: t("xlsx.confirm.importTitle"),
      description: t("xlsx.confirm.importDescription"),
      confirm: t("xlsx.confirm.importConfirm"),
    };
  }
  if (props.confirmation === "export") {
    return {
      kind: "confirmation" as const,
      theme: "warning" as const,
      header: t("xlsx.confirm.exportTitle"),
      description: t("xlsx.confirm.exportDescription"),
      confirm: t("xlsx.confirm.exportConfirm"),
    };
  }
  if (props.feedback?.error) {
    return {
      kind: "error" as const,
      theme: "danger" as const,
      header: t(
        props.feedback.key === "xlsx.feedback.importedUnsaved"
          ? "xlsx.feedback.importedUnsavedTitle"
          : "xlsx.feedback.errorTitle",
      ),
      description:
        props.feedback.key === "xlsx.feedback.blocked" && issues.value.length
          ? t("xlsx.report.blockedDescription")
          : t(props.feedback.key, { locations: props.feedback.locations ?? "" }),
      confirm: t("xlsx.confirm.close"),
    };
  }
  return undefined;
});

function confirm(): void {
  if (props.busy) return;
  if (dialogContent.value?.kind === "error") emit("dismiss");
  else emit("confirm");
}

function close(): void {
  if (props.busy) return;
  if (dialogContent.value?.kind === "error") emit("dismiss");
  else emit("cancel");
}
</script>

<template>
  <Dialog
    v-if="dialogContent"
    :key="dialogContent.kind"
    :visible="true"
    attach="body"
    :header="dialogContent.header"
    :footer="dialogContent.kind !== 'error'"
    :confirm-btn="dialogContent.confirm"
    :cancel-btn="
      dialogContent.kind === 'error' ? null : { content: t('xlsx.confirm.cancel'), disabled: busy }
    "
    :confirm-loading="busy"
    :close-btn="dialogContent.kind === 'error' && !busy"
    :close-on-esc-keydown="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :width="issues.length ? 'min(600px, calc(100vw - 32px))' : 'min(440px, calc(100vw - 32px))'"
    placement="center"
    :theme="dialogContent.theme"
    @confirm="confirm"
    @close="close"
  >
    <p
      class="xlsx-file-feedback__dialog-description"
      :data-xlsx-error="dialogContent.kind === 'error' ? '' : undefined"
    >
      {{ dialogContent.description }}
    </p>
    <p v-if="confirmation === 'import' && hasWarnings" class="xlsx-file-feedback__warning">
      {{ t("xlsx.report.importWarning") }}
    </p>
    <section
      v-if="issues.length"
      class="xlsx-file-feedback__report"
      data-xlsx-report
      :data-xlsx-confirmation-report="dialogContent.kind === 'confirmation' ? '' : undefined"
      :data-xlsx-error-report="dialogContent.kind === 'error' ? '' : undefined"
      :aria-label="t('xlsx.report.title')"
    >
      <h3>{{ t("xlsx.report.title") }}</h3>
      <ul class="xlsx-file-feedback__issues">
        <li
          v-for="(issue, index) in issues"
          :key="`${issue.severity}:${issue.code}:${index}`"
          data-xlsx-issue
        >
          <div class="xlsx-file-feedback__issue-heading">
            <strong>{{ issueLabel(issue.code) }}</strong>
            <span>{{
              t(issue.severity === "block" ? "xlsx.report.block" : "xlsx.report.warning")
            }}</span>
          </div>
          <p>{{ t("xlsx.report.count", { count: issue.count }) }}</p>
          <ul v-if="issue.locations.length" class="xlsx-file-feedback__locations">
            <li v-for="(location, locationIndex) in issue.locations" :key="locationIndex">
              {{ location }}
            </li>
          </ul>
          <p v-else>{{ t("xlsx.report.locationUnknown") }}</p>
          <p v-if="issue.locations.length && issue.count > issue.locations.length">
            {{ t("xlsx.report.moreLocations", { count: issue.count - issue.locations.length }) }}
          </p>
        </li>
      </ul>
    </section>
  </Dialog>
</template>

<style scoped lang="scss">
.xlsx-file-feedback {
  &__dialog-description {
    margin: 0;
  }
  &__warning {
    margin: 12px 0 0;
  }
  &__report {
    margin-top: 16px;
    max-height: min(44vh, 360px);
    overflow: auto;
    overflow-wrap: anywhere;
    h3 {
      margin: 0 0 8px;
      font-size: var(--sheetcraft-font-size-title-small);
      line-height: var(--sheetcraft-line-height-title-small);
      font-weight: 600;
    }
    p {
      margin: 4px 0 0;
    }
  }
  &__issues {
    display: grid;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  &__issue-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  &__locations {
    margin: 4px 0 0;
    padding-left: 20px;
  }
}
</style>
