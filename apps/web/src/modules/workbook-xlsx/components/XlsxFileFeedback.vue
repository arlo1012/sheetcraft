<script setup lang="ts">
import { computed } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { XlsxConfirmation, XlsxFeedback } from "../useWorkbookXlsxActions";
import type { XlsxCompatibilityReport } from "../xlsxWorkerProtocol";

const props = defineProps<{
  busy: boolean;
  confirmation?: XlsxConfirmation;
  feedback?: XlsxFeedback;
  report?: XlsxCompatibilityReport;
}>();
const emit = defineEmits<{ confirm: []; cancel: []; dismiss: [] }>();
const { t } = useAppI18n();
const issues = computed(() => props.report?.issues ?? []);
const codeKeys: Partial<Record<string, MessageKey>> = {
  "archive-encrypted": "xlsx.report.codes.archiveEncrypted",
  "archive-invalid": "xlsx.report.codes.archiveInvalid",
  "archive-limit": "xlsx.report.codes.archiveLimit",
  "archive-unsafe-path": "xlsx.report.codes.archiveUnsafePath",
  "archive-unsupported-compression": "xlsx.report.codes.archiveUnsupportedCompression",
  "cell-value-omitted": "xlsx.report.codes.cellValueOmitted",
  "date-normalized": "xlsx.report.codes.dateNormalized",
  "dimension-approximated": "xlsx.report.codes.dimensionApproximated",
  "drawing-or-media": "xlsx.report.codes.drawingOrMedia",
  "external-content": "xlsx.report.codes.externalContent",
  "feature-omitted": "xlsx.report.codes.featureOmitted",
  "filter-omitted": "xlsx.report.codes.filterOmitted",
  "formula-cache-discarded": "xlsx.report.codes.formulaCacheDiscarded",
  "formula-not-calculated": "xlsx.report.codes.formulaNotCalculated",
  "image-omitted": "xlsx.report.codes.imageOmitted",
  "macro-content": "xlsx.report.codes.macroContent",
  "number-format-omitted": "xlsx.report.codes.numberFormatOmitted",
  "style-omitted": "xlsx.report.codes.styleOmitted",
};
const severityKeys = {
  block: "xlsx.report.block",
  warning: "xlsx.report.warning",
} satisfies Record<XlsxCompatibilityReport["issues"][number]["severity"], MessageKey>;
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
      header: t("xlsx.feedback.errorTitle"),
      description: t(props.feedback.key),
      confirm: t("xlsx.confirm.close"),
    };
  }
  return undefined;
});

function locations(issue: XlsxCompatibilityReport["issues"][number]): string {
  return issue.locations.join(", ");
}

function codeDescription(code: string): string {
  return t(codeKeys[code] ?? "xlsx.report.codes.featureOmitted");
}

function confirm(): void {
  if (dialogContent.value?.kind === "error") emit("dismiss");
  else emit("confirm");
}

function close(): void {
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
    :confirm-btn="dialogContent.confirm"
    :cancel-btn="
      dialogContent.kind === 'error' ? null : { content: t('xlsx.confirm.cancel'), disabled: busy }
    "
    :confirm-loading="busy"
    :close-btn="false"
    :close-on-esc-keydown="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(440px, calc(100vw - 32px))"
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
    <div
      v-if="issues.length"
      class="xlsx-file-feedback__dialog-report"
      :data-xlsx-confirmation-report="dialogContent.kind === 'confirmation' ? '' : undefined"
      :data-xlsx-error-report="dialogContent.kind === 'error' ? '' : undefined"
    >
      <strong>{{ t("xlsx.report.title") }}</strong>
      <ul>
        <li v-for="issue in issues" :key="`dialog-${issue.code}-${issue.severity}`">
          <strong>{{ t(severityKeys[issue.severity]) }}</strong>
          {{
            t("xlsx.report.issue", {
              code: codeDescription(issue.code),
              count: issue.count,
              locations: locations(issue),
            })
          }}
        </li>
      </ul>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.xlsx-file-feedback {
  &__dialog-description {
    margin: 0 0 8px;
  }

  &__dialog-report {
    max-height: min(240px, 35vh);
    padding: 8px;
    overflow: auto;
    background: var(--idea-surface-secondary);
    border: 1px solid var(--idea-border-subtle);

    ul {
      padding-left: 18px;
      margin: 4px 0 0;
    }
  }
}
</style>
