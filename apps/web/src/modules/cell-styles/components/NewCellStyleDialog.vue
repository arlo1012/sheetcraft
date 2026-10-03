<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { createBuiltinCellStyles, type CellStyleDefinition } from "@idea10/core/cell-styles";
import { cellStyleLabel } from "../cell-style-presentation";
import type { CellFormatChange } from "@idea10/core/commands";
import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  type CellStylePatch,
} from "@idea10/core/style";
import CellFormatDialog from "../../cell-format/components/CellFormatDialog.vue";
import { getCellFormatBorderCapabilities } from "../../cell-format/border-capabilities";
import {
  mergeStyleFormatChange,
  styleFormatToBorderState,
  stylePatchToSelectionState,
  type StyleFormatDraft,
} from "../../../shared/cell-format/style-format-dialog";
import { createBrowserIdFactory } from "../../../shared/runtime/browser-id-factory";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    existingNames: readonly string[];
    style?: CellStyleDefinition;
    initialStyle: CellStylePatch;
    dateSystem?: "1900" | "1904";
  }>(),
  { style: undefined, dateSystem: "1900" },
);
const emit = defineEmits<{ confirm: [style: CellStyleDefinition]; cancel: [] }>();
const { t } = useAppI18n();
const idFactory = createBrowserIdFactory();
const formatDialogOpen = ref(false);
const name = ref("");
const draft = ref<CellStyleDefinition>(makeDraft());

const title = computed(() =>
  t(props.style ? "cellStyles.dialog.editTitle" : "cellStyles.dialog.newTitle"),
);
const builtinNames = computed(() =>
  createBuiltinCellStyles().flatMap((style) => [style.name, cellStyleLabel(style, t)]),
);
const duplicateName = computed(() => {
  const candidate = name.value.trim().toLocaleLowerCase();
  return (
    candidate.length > 0 &&
    [...props.existingNames, ...builtinNames.value].some(
      (existing) => existing.toLocaleLowerCase() === candidate && existing !== props.style?.name,
    )
  );
});
const draftFormat = computed<StyleFormatDraft>(() => ({ style: draft.value.style }));

function nextName(): string {
  const existing = new Set(props.existingNames.map((value) => value.trim().toLocaleLowerCase()));
  let index = 1;
  let candidate = t("cellStyles.dialog.namePlaceholder", { index });
  while (existing.has(candidate.toLocaleLowerCase()))
    candidate = t("cellStyles.dialog.namePlaceholder", { index: ++index });
  return candidate;
}
function makeDraft(): CellStyleDefinition {
  const style = props.style
    ? (JSON.parse(JSON.stringify(toRaw(props.style))) as CellStyleDefinition)
    : undefined;
  name.value = style?.name ?? nextName();
  return (
    style ?? {
      id: idFactory("cell-style-custom"),
      name: name.value,
      category: "custom",
      style: { ...props.initialStyle },
    }
  );
}
function saveFormat(change: CellFormatChange): void {
  const merged = mergeStyleFormatChange(draftFormat.value, change, { includeInnerBorders: false });
  draft.value = { ...draft.value, style: merged.style };
  formatDialogOpen.value = false;
}
function confirm(): void {
  if (!name.value.trim() || duplicateName.value) return;
  emit("confirm", { ...draft.value, name: name.value.trim(), category: "custom" });
}
function formatSummary(kind: "number" | "alignment" | "font" | "border" | "fill"): string {
  const style = draft.value.style;
  if (kind === "number") return numberSummary(style);
  if (kind === "alignment")
    return `${t(alignmentKey("horizontal", style.horizontalAlign || "general"))}, ${t(alignmentKey("vertical", style.verticalAlign || "bottom"))}`;
  if (kind === "font")
    return `${style.fontFamily || DEFAULT_CELL_FONT_FAMILY}, ${style.fontSize || DEFAULT_CELL_FONT_SIZE}, ${fontSummary(style)}`;
  if (kind === "border")
    return style.borderTop || style.borderRight || style.borderBottom || style.borderLeft
      ? t("cellStyles.dialog.borderConfigured")
      : t("cellStyles.dialog.noBorder");
  return style.fillColor || style.fillPattern || style.fillGradient
    ? t("cellStyles.dialog.fillConfigured")
    : t("cellFormat.noFill");
}

function numberSummary(style: CellStylePatch): string {
  const format = style.numberFormat;
  if (!format) return t("cellFormat.general");
  switch (format.kind) {
    case "number":
      return t("cellFormat.numeric");
    case "percent":
      return t("cellFormat.percent");
    case "currency":
      return t("cellFormat.currency");
    case "accounting":
      return t("cellFormat.accounting");
    case "date":
      return t("cellFormat.date");
    case "time":
      return t("cellFormat.time");
    case "fraction":
      return t("cellFormat.fraction");
    case "scientific":
      return t("cellFormat.scientific");
    case "text":
      return t("cellFormat.text");
    case "custom":
      return t("cellFormat.custom");
    case "special":
      return t("cellFormat.special");
    default:
      return t("cellFormat.general");
  }
}
function alignmentKey(
  axis: "horizontal" | "vertical",
  value: string,
):
  | "cellFormat.horizontalGeneral"
  | "cellFormat.horizontalLeft"
  | "cellFormat.horizontalCenter"
  | "cellFormat.horizontalRight"
  | "cellFormat.horizontalFill"
  | "cellFormat.horizontalJustify"
  | "cellFormat.horizontalCenterContinuous"
  | "cellFormat.horizontalDistributed"
  | "cellFormat.verticalTop"
  | "cellFormat.verticalMiddle"
  | "cellFormat.verticalBottom"
  | "cellFormat.verticalJustify"
  | "cellFormat.verticalDistributed" {
  const labels = {
    horizontal: {
      general: "cellFormat.horizontalGeneral",
      left: "cellFormat.horizontalLeft",
      center: "cellFormat.horizontalCenter",
      right: "cellFormat.horizontalRight",
      fill: "cellFormat.horizontalFill",
      justify: "cellFormat.horizontalJustify",
      centerContinuous: "cellFormat.horizontalCenterContinuous",
      distributed: "cellFormat.horizontalDistributed",
    },
    vertical: {
      top: "cellFormat.verticalTop",
      middle: "cellFormat.verticalMiddle",
      bottom: "cellFormat.verticalBottom",
      justify: "cellFormat.verticalJustify",
      distributed: "cellFormat.verticalDistributed",
    },
  } as const;
  return labels[axis][value as never];
}
function fontSummary(style: CellStylePatch): string {
  if (style.bold && style.italic) return t("cellFormat.fontBoldItalic");
  if (style.bold) return t("cellStyles.dialog.fontBold");
  if (style.italic) return t("cellStyles.dialog.fontItalic");
  return t("cellFormat.fontRegular");
}

watch(
  () => props.style,
  () => {
    draft.value = makeDraft();
  },
);
</script>

<template>
  <Dialog
    v-if="!formatDialogOpen"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :visible="true"
    :header="title"
    :confirm-btn="{
      content: t('cellStyles.dialog.confirm'),
      disabled: !name.trim() || duplicateName,
    }"
    :cancel-btn="t('cellStyles.dialog.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(510px, calc(100vw - 32px))"
    placement="center"
    class="new-cell-style-dialog"
    @confirm="confirm"
    @close="emit('cancel')"
  >
    <div class="new-cell-style-dialog__content">
      <div class="new-cell-style-dialog__name">
        <label for="cell-style-name">{{ t("cellStyles.dialog.name") }}</label>
        <TInput
          id="cell-style-name"
          v-model="name"
          autofocus
          :status="duplicateName ? 'error' : undefined"
          data-cell-style-name
        />
        <TButton theme="default" variant="outline" @click="formatDialogOpen = true">{{
          t("cellStyles.dialog.format")
        }}</TButton>
        <p v-if="duplicateName" role="alert">{{ t("cellStyles.dialog.styleNameExists") }}</p>
      </div>
      <section class="new-cell-style-dialog__summary" :aria-label="t('cellStyles.dialog.summary')">
        <h3>{{ t("cellStyles.dialog.summary") }}</h3>
        <dl>
          <template
            v-for="item in ['number', 'alignment', 'font', 'border', 'fill'] as const"
            :key="item"
            ><dt>{{ t(`cellStyles.dialog.${item}`) }}</dt>
            <dd>{{ formatSummary(item) }}</dd></template
          >
        </dl>
      </section>
    </div>
  </Dialog>
  <CellFormatDialog
    v-else
    :state="stylePatchToSelectionState(draft.style)"
    :border-state="styleFormatToBorderState(draftFormat)"
    :border-capabilities="
      getCellFormatBorderCapabilities(
        { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        [],
      )
    "
    sample-value="1234.56"
    :date-system="dateSystem"
    :initial-style-patch="draft.style"
    @confirm="saveFormat"
    @cancel="formatDialogOpen = false"
  />
</template>

<style scoped lang="scss">
.new-cell-style-dialog__content {
  display: grid;
  gap: 12px;
}
.new-cell-style-dialog__name {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 10px;
}
.new-cell-style-dialog__name p {
  grid-column: 2 / -1;
  margin: -3px 0 0;
  color: var(--idea-status-error);
  font-size: var(--idea-font-size-body-small);
}
.new-cell-style-dialog__summary h3 {
  margin: 0 0 7px;
  font-size: var(--idea-font-size-body-medium);
  font-weight: var(--idea-font-weight-medium);
}
.new-cell-style-dialog dl {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
}
.new-cell-style-dialog dt,
.new-cell-style-dialog dd {
  min-height: 20px;
  padding: 0;
  font-size: var(--idea-font-size-body-small);
}
.new-cell-style-dialog dt {
  color: var(--idea-text-secondary);
}
.new-cell-style-dialog dd {
  margin: 0;
  color: var(--idea-text-primary);
}
</style>
