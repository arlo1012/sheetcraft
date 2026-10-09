<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import {
  CELL_STYLE_INCLUDES,
  createBuiltinCellStyles,
  type CellStyleDefinition,
  type CellStyleInclude,
} from "@sheetcraft/core/cell-styles";
import { cellStyleLabel } from "../cell-style-presentation";
import type { CellFormatChange } from "@sheetcraft/core/commands";
import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  type CellBorder,
  type CellStylePatch,
} from "@sheetcraft/core/style";
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
    error?: string;
  }>(),
  { style: undefined, dateSystem: "1900", error: "" },
);
const emit = defineEmits<{ confirm: [style: CellStyleDefinition]; cancel: [] }>();
const { t } = useAppI18n();
const idFactory = createBrowserIdFactory();
const formatDialogOpen = ref(false);
const name = ref("");
const includes = ref<CellStyleInclude[]>([...CELL_STYLE_INCLUDES]);
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
const hasIncludes = computed(() => includes.value.length > 0);

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
  includes.value = style?.includes ? [...style.includes] : [...CELL_STYLE_INCLUDES];
  return (
    style ?? {
      id: idFactory("cell-style-custom"),
      name: name.value,
      category: "custom",
      style: { ...props.initialStyle },
      includes: [...CELL_STYLE_INCLUDES],
    }
  );
}
function saveFormat(change: CellFormatChange): void {
  const merged = mergeStyleFormatChange(draftFormat.value, change, { includeInnerBorders: false });
  draft.value = { ...draft.value, style: merged.style };
  formatDialogOpen.value = false;
}
function confirm(): void {
  if (!name.value.trim() || duplicateName.value || !hasIncludes.value) return;
  emit("confirm", {
    ...draft.value,
    includes: CELL_STYLE_INCLUDES.filter((kind) => includes.value.includes(kind)),
    name: name.value.trim(),
    category: "custom",
  });
}
function setInclude(kind: CellStyleInclude, checked: boolean): void {
  includes.value = checked
    ? [...new Set([...includes.value, kind])]
    : includes.value.filter((value) => value !== kind);
}
function formatSummary(kind: CellStyleInclude): string {
  const style = draft.value.style;
  if (kind === "number") return numberSummary(style);
  if (kind === "alignment") return alignmentSummary(style);
  if (kind === "font")
    return [
      style.fontFamily || DEFAULT_CELL_FONT_FAMILY,
      `${style.fontSize || DEFAULT_CELL_FONT_SIZE} pt`,
      fontSummary(style),
    ]
      .filter(Boolean)
      .join(", ");
  if (kind === "border") return borderSummary(style);
  return fillSummary(style);
}

function numberSummary(style: CellStylePatch): string {
  const format = style.numberFormat;
  if (!format) return t("cellFormat.general");
  if ("code" in format) return format.code;
  const digits = "fractionDigits" in format ? format.fractionDigits : undefined;
  const fraction =
    digits === undefined ? "" : `; ${t("cellStyles.dialog.decimalPlaces", { count: digits })}`;
  switch (format.kind) {
    case "number":
      return `${t("cellFormat.numeric")}${fraction}`;
    case "percent":
      return `${t("cellFormat.percent")}${fraction}`;
    case "currency":
      return `${format.currencySymbol || format.currency || t("cellFormat.currency")}${fraction}`;
    case "accounting":
      return `${format.currencySymbol || format.currency || t("cellFormat.accounting")}${fraction}`;
    case "scientific":
      return `${t("cellFormat.scientific")}${fraction}`;
    case "text":
      return t("cellFormat.text");
    default:
      return t("cellFormat.general");
  }
}
function alignmentSummary(style: CellStylePatch): string {
  const values = [
    t(alignmentKey("horizontal", style.horizontalAlign || "general")),
    t(alignmentKey("vertical", style.verticalAlign || "bottom")),
  ];
  if (style.wrapText) values.push(t("cellFormat.wrapText"));
  if (style.shrinkToFit) values.push(t("cellFormat.shrinkToFit"));
  if (style.indent) values.push(t("cellStyles.dialog.indent", { value: style.indent }));
  if (style.textRotation === "vertical") values.push(t("cellFormat.verticalText"));
  else if (style.textRotation)
    values.push(t("cellStyles.dialog.rotation", { value: style.textRotation }));
  return values.join(", ");
}
function borderSummary(style: CellStylePatch): string {
  const configured = [
    borderSummaryItem("cellStyles.dialog.borderTop", style.borderTop),
    borderSummaryItem("cellStyles.dialog.borderRight", style.borderRight),
    borderSummaryItem("cellStyles.dialog.borderBottom", style.borderBottom),
    borderSummaryItem("cellStyles.dialog.borderLeft", style.borderLeft),
    borderSummaryItem(
      "cellStyles.dialog.borderDiagonal",
      style.borderDiagonalUp || style.borderDiagonalDown,
    ),
  ].filter((item): item is string => Boolean(item));
  return configured.join(", ") || t("cellStyles.dialog.noBorder");
}
function borderSummaryItem(
  label:
    | "cellStyles.dialog.borderTop"
    | "cellStyles.dialog.borderRight"
    | "cellStyles.dialog.borderBottom"
    | "cellStyles.dialog.borderLeft"
    | "cellStyles.dialog.borderDiagonal",
  border: CellBorder | false | null | undefined,
): string | undefined {
  return border ? `${t(label)}: ${border.style} ${border.color}` : undefined;
}
function fillSummary(style: CellStylePatch): string {
  if (style.fillGradient)
    return t("cellStyles.dialog.gradientFill", { count: style.fillGradient.stops.length });
  const values = [style.fillColor, style.fillPattern, style.fillPatternColor].filter(Boolean);
  return values.join(", ") || t("cellFormat.noFill");
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
  const values = [];
  if (style.bold) values.push(t("cellStyles.dialog.fontBold"));
  if (style.italic) values.push(t("cellStyles.dialog.fontItalic"));
  if (style.underline) values.push(t("format.underline"));
  if (style.strikethrough) values.push(t("ribbon.strikethrough"));
  if (style.fontScript === "superscript") values.push(t("cellFormat.superscript"));
  if (style.fontScript === "subscript") values.push(t("cellFormat.subscript"));
  if (style.textColor) values.push(style.textColor);
  return values.join(", ") || t("cellFormat.fontRegular");
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
      disabled: !name.trim() || duplicateName || !hasIncludes,
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
      <p v-if="error" class="new-cell-style-dialog__error" role="alert">{{ error }}</p>
      <section class="new-cell-style-dialog__summary" :aria-label="t('cellStyles.dialog.summary')">
        <h3>{{ t("cellStyles.dialog.summary") }}</h3>
        <dl>
          <template v-for="item in CELL_STYLE_INCLUDES" :key="item"
            ><dt>
              <TCheckbox
                :model-value="includes.includes(item)"
                :data-cell-style-include="item"
                @update:model-value="setInclude(item, $event)"
                >{{ t(`cellStyles.dialog.${item}`) }}</TCheckbox
              >
            </dt>
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
  color: var(--sheetcraft-status-error);
  font-size: var(--sheetcraft-font-size-body-small);
}
.new-cell-style-dialog__error {
  margin: 0;
  color: var(--sheetcraft-status-error);
  font-size: var(--sheetcraft-font-size-body-small);
}
.new-cell-style-dialog__summary h3 {
  margin: 0 0 7px;
  font-size: var(--sheetcraft-font-size-body-medium);
  font-weight: var(--sheetcraft-font-weight-medium);
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
  font-size: var(--sheetcraft-font-size-body-small);
}
.new-cell-style-dialog dt {
  color: var(--sheetcraft-text-secondary);
}
.new-cell-style-dialog dt :deep(.t-checkbox) {
  margin: 0;
}
.new-cell-style-dialog dd {
  margin: 0;
  color: var(--sheetcraft-text-primary);
}
</style>
