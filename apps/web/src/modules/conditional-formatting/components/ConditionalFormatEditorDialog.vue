<script setup lang="ts">
import {
  cloneConditionalFormatRule,
  normalizeConditionalFormatRules,
  type ConditionalFormatIconSet,
  type ConditionalFormatStyle,
  type SheetConditionalFormatRule,
} from "@sheetcraft/core/conditional-formatting";
import { toWorkbookErrorData } from "@sheetcraft/core/errors";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { computed, reactive, ref, watch } from "vue";
import DialogFooter from "../../../shared/dialog/DialogFooter.vue";
import { useAppI18n } from "../../../shared/i18n";
import OptionList from "../../../shared/option-list/OptionList.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  buildConditionFromDraft,
  buildVisualConditionFromDraft,
  createConditionalFormatEditorDraft,
  thresholdFromDraft,
  type ConditionalFormatConditionKind,
  type ConditionalFormatEditorDraft,
  type ConditionalFormatEditorKind,
  type ConditionalFormatThresholdKind,
} from "../conditional-format-editor-draft";
import { conditionalFormatPresetStyle } from "../conditional-format-quick-rules";
import { parseConditionalFormatRanges } from "../conditional-formatting-ui";
import ConditionalFormatAverageCriteria from "./ConditionalFormatAverageCriteria.vue";
import ConditionalFormatContainingCriteria, {
  type ContainingRuleType,
} from "./ConditionalFormatContainingCriteria.vue";
import ConditionalFormatDuplicateCriteria from "./ConditionalFormatDuplicateCriteria.vue";
import ConditionalFormatPreview from "./ConditionalFormatPreview.vue";
import ConditionalFormatRankCriteria from "./ConditionalFormatRankCriteria.vue";
import ConditionalFormatStyleDialog from "./ConditionalFormatStyleDialog.vue";
import ConditionalFormatVisualCriteria from "./ConditionalFormatVisualCriteria.vue";
import DataBarAdvancedSettingsDialog, {
  type DataBarAdvancedSettings,
} from "./DataBarAdvancedSettingsDialog.vue";

export type { ConditionalFormatEditorKind };

const props = defineProps<{
  visible: boolean;
  rule?: SheetConditionalFormatRule;
  ranges: string;
  initialKind?: ConditionalFormatEditorKind;
  sampleValue?: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
  selectReference?: (current: string) => Promise<string | undefined>;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  close: [];
  save: [rule: SheetConditionalFormatRule];
}>();

const { t } = useAppI18n();
const draft = reactive<ConditionalFormatEditorDraft>(
  createConditionalFormatEditorDraft({
    rule: props.rule,
    ranges: props.ranges,
    initialKind: props.initialKind,
  }),
);
const format = ref<ConditionalFormatStyle>(
  props.rule
    ? cloneConditionalFormatRule(props.rule).style
    : conditionalFormatPresetStyle("redFillText"),
);
const customVisible = ref(false);
const dataBarAdvancedVisible = ref(false);
const pickingRange = ref(false);
const error = reactive({ ranges: "", value: "", formula: "", format: "" });

async function selectRange(current: string): Promise<string | undefined> {
  pickingRange.value = true;
  try {
    return await props.selectReference?.(current);
  } finally {
    pickingRange.value = false;
  }
}

async function selectValueReference(current: string): Promise<string | undefined> {
  pickingRange.value = true;
  try {
    return await props.selectValueReference?.(current);
  } finally {
    pickingRange.value = false;
  }
}

type RuleCategory = "visual" | "containing" | "rank" | "average" | "duplicate" | "formula";
const categoryOptions = computed(
  () =>
    [
      { value: "visual", label: t("conditionalFormatting.ruleAllValues") },
      { value: "containing", label: t("conditionalFormatting.ruleContaining") },
      { value: "rank", label: t("conditionalFormatting.ruleRank") },
      { value: "average", label: t("conditionalFormatting.ruleAverage") },
      { value: "duplicate", label: t("conditionalFormatting.ruleDuplicate") },
      { value: "formula", label: t("conditionalFormatting.formula") },
    ] as const,
);
const category = computed<RuleCategory>(() =>
  ["dataBar", "colorScale", "iconSet"].includes(draft.kind)
    ? "visual"
    : ["cellValue", "text", "blank", "date", "error"].includes(draft.kind)
      ? "containing"
      : (draft.kind as RuleCategory),
);
const hasInlineFormat = computed(() => category.value !== "visual");
const ruleDescription = computed(() => {
  switch (category.value) {
    case "containing":
      return t("conditionalFormatting.containingDescription");
    case "rank":
      return t("conditionalFormatting.rankDescription");
    case "average":
      return t("conditionalFormatting.averageDescription");
    case "duplicate":
      return t("conditionalFormatting.duplicateDescription");
    case "formula":
      return t("conditionalFormatting.formulaDescription");
    default:
      return categoryOptions.value.find((option) => option.value === category.value)?.label;
  }
});

function selectCategory(value: RuleCategory) {
  if (value === category.value) return;
  updateKind(value === "visual" ? "colorScale" : value === "containing" ? "cellValue" : value);
}

const containingType = computed<ContainingRuleType>({
  get: () =>
    draft.kind === "blank"
      ? draft.blank
        ? "blank"
        : "nonBlank"
      : draft.kind === "error"
        ? draft.hasError
          ? "error"
          : "nonError"
        : (draft.kind as ContainingRuleType),
  set: (value) => {
    if (value === containingType.value) return;
    if (value === "blank" || value === "nonBlank") {
      updateKind("blank");
      draft.blank = value === "blank";
    } else if (value === "error" || value === "nonError") {
      updateKind("error");
      draft.hasError = value === "error";
    } else updateKind(value);
    error.value = "";
  },
});

function resetDraft() {
  format.value = props.rule
    ? cloneConditionalFormatRule(props.rule).style
    : conditionalFormatPresetStyle("redFillText");
  customVisible.value = false;
  dataBarAdvancedVisible.value = false;
  Object.assign(
    draft,
    createConditionalFormatEditorDraft({
      rule: props.rule,
      ranges: props.ranges,
      initialKind: props.initialKind,
    }),
  );
  Object.assign(error, { ranges: "", value: "", formula: "", format: "" });
}

function updateKind(kind: ConditionalFormatConditionKind) {
  const wasDataBar = draft.kind === "dataBar";
  draft.kind = kind;
  if (kind === "text") draft.operator = "contains";
  if (kind === "cellValue") draft.operator = "between";
  if (kind === "dataBar") {
    draft.minimumKind = "autoMin";
    draft.maximumKind = "autoMax";
  }
  if (wasDataBar && kind !== "dataBar") {
    if (draft.minimumKind === "autoMin") draft.minimumKind = "min";
    if (draft.maximumKind === "autoMax") draft.maximumKind = "max";
  }
}

function updateOperand(value: string, second = false): void {
  if (second) {
    draft.secondValue = value;
    draft.secondValueIsString = false;
  } else {
    draft.value = value;
    draft.valueIsString = false;
  }
}

function setIconThresholdKind(index: number, kind: ConditionalFormatThresholdKind): void {
  const previous = draft.iconThresholds[index];
  const next = thresholdFromDraft(
    kind,
    previous && "value" in previous
      ? String(previous.value)
      : previous?.kind === "formula"
        ? previous.formula
        : String(Math.round((index / draft.iconThresholds.length) * 100)),
  );
  draft.iconThresholds[index] = {
    ...next,
    ...(previous?.inclusive === false ? { inclusive: false } : {}),
  };
}

function setIconThresholdValue(index: number, value: string): void {
  const previous = draft.iconThresholds[index];
  if (!previous) return;
  const kind = value.trim().startsWith("=") ? "formula" : previous.kind;
  draft.iconThresholds[index] = {
    ...thresholdFromDraft(kind, value),
    ...(previous.inclusive === false ? { inclusive: false } : {}),
  };
}

function setIconThresholdInclusive(index: number, inclusive: boolean): void {
  const previous = draft.iconThresholds[index];
  if (!previous) return;
  draft.iconThresholds[index] = { ...previous, inclusive: inclusive ? undefined : false };
}

function setIconSet(iconSet: ConditionalFormatIconSet): void {
  if (draft.iconSet === iconSet) return;
  draft.iconSet = iconSet;
  draft.iconIcons = undefined;
}

function setIcon(
  index: number,
  icon: { iconSet: ConditionalFormatIconSet; iconIndex: number } | null,
): void {
  const length = draft.iconThresholds.length;
  const rawIndex = draft.reverse ? length - index - 1 : index;
  const icons =
    draft.iconIcons ??
    Array.from({ length }, (_, iconIndex) => ({
      iconSet: draft.iconSet,
      iconIndex,
    }));
  icons[rawIndex] = icon;
  draft.iconIcons = icons;
}

watch(
  () => draft.iconSet,
  (kind) => {
    const count = kind.startsWith("three") ? 3 : kind.startsWith("four") ? 4 : 5;
    if (draft.iconThresholds.length !== count)
      draft.iconThresholds = Array.from({ length: count }, (_, index) =>
        thresholdFromDraft("percent", String(Math.round((index / count) * 100))),
      );
    if (draft.iconIcons && draft.iconIcons.length !== count) draft.iconIcons = undefined;
  },
);

const previewCondition = computed(() => buildVisualConditionFromDraft(draft));

function save() {
  Object.assign(error, { ranges: "", value: "", formula: "", format: "" });
  const ranges = parseConditionalFormatRanges(draft.ranges);
  if (!ranges) {
    error.ranges = t("conditionalFormatting.invalidRange");
    return;
  }
  const built = buildConditionFromDraft(draft, t);
  if (!built.ok) {
    error[built.field] = built.message;
    return;
  }
  const candidate: SheetConditionalFormatRule = {
    id: draft.id,
    ranges,
    anchor: { ...ranges[0]!.start },
    condition: built.condition,
    style:
      draft.kind === "dataBar" || draft.kind === "colorScale" || draft.kind === "iconSet"
        ? {}
        : format.value,
    ...(props.rule?.stopIfTrue && category.value !== "visual" ? { stopIfTrue: true } : {}),
  };
  try {
    emit("save", normalizeConditionalFormatRules([candidate])[0]!);
  } catch (cause) {
    const field = toWorkbookErrorData(cause).details?.field;
    if (typeof field === "string" && field.endsWith(".range")) {
      const message = t("conditionalFormatting.singleValueRequired");
      if (category.value === "visual") error.format = message;
      else if (draft.kind === "formula") error.formula = message;
      else error.value = message;
      return;
    }
    if (typeof field === "string" && field.endsWith(".formula")) {
      if (category.value === "visual")
        error.format = t("conditionalFormatting.invalidThresholdFormula");
      else error.formula = t("conditionalFormatting.invalidFormula");
      return;
    }
    if (
      field === "condition.value" ||
      field === "condition.secondValue" ||
      field === "condition.text"
    ) {
      error.value = t("conditionalFormatting.invalidFormula");
      return;
    }
    error.format = t(
      ["dataBar", "colorScale", "iconSet"].includes(draft.kind)
        ? "conditionalFormatting.invalidThresholds"
        : "conditionalFormatting.invalidFormat",
    );
  }
}

function updateDataBarAdvancedSettings(settings: DataBarAdvancedSettings): void {
  draft.negativeColor = settings.negativeColor;
  draft.negativeBorderColor = settings.negativeBorderColor;
  draft.axisPosition = settings.axisPosition;
  draft.axisColor = settings.axisColor;
  dataBarAdvancedVisible.value = false;
}

watch(() => [props.visible, props.rule, props.ranges], resetDraft, {
  deep: true,
});
</script>

<template>
  <Dialog
    :visible="visible && !customVisible && !pickingRange && !dataBarAdvancedVisible"
    :header="rule ? t('conditionalFormatting.editRule') : t('conditionalFormatting.newRule')"
    :confirm-btn="{ content: t('conditionalFormatting.save') }"
    :cancel-btn="t('conditionalFormatting.cancel')"
    :close-on-overlay-click="false"
    width="min(640px, calc(100vw - 32px))"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <TForm
      class="conditional-format-editor sheetcraft-form-grid"
      layout="vertical"
      label-align="left"
      :label-width="88"
    >
      <section class="conditional-format-editor__section">
        <h3>{{ t("conditionalFormatting.selectRuleType") }}</h3>
        <OptionList
          :model-value="category"
          :options="categoryOptions"
          :label="t('conditionalFormatting.selectRuleType')"
          variant="compact"
          @select="selectCategory"
        />
      </section>
      <TFormItem
        :label="t('conditionalFormatting.appliesTo')"
        :tips="error.ranges"
        label-align="left"
      >
        <RangeReferenceInput
          v-model="draft.ranges"
          :label="t('conditionalFormatting.appliesTo')"
          class="conditional-format-editor__range"
          :show-picker="true"
          :select-reference="selectReference ? selectRange : undefined"
        />
      </TFormItem>
      <section
        class="conditional-format-editor__section conditional-format-editor__section--detail"
      >
        <h3>{{ t("conditionalFormatting.editRuleDescription") }}</h3>
        <p class="conditional-format-editor__description">
          {{ ruleDescription }}
        </p>
        <ConditionalFormatVisualCriteria
          v-if="category === 'visual'"
          :draft="draft"
          :preview-condition="previewCondition"
          :select-value-reference="props.selectValueReference ? selectValueReference : undefined"
          @update-kind="updateKind"
          @set-icon-set="setIconSet"
          @set-icon-threshold-kind="setIconThresholdKind"
          @set-icon-threshold-value="setIconThresholdValue"
          @set-icon-threshold-inclusive="setIconThresholdInclusive"
          @set-icon="setIcon"
          @open-data-bar-advanced="dataBarAdvancedVisible = true"
        />
        <ConditionalFormatContainingCriteria
          v-else-if="category === 'containing'"
          v-model:type="containingType"
          v-model:operator="draft.operator"
          v-model:date-period="draft.datePeriod"
          :value="draft.value"
          :second-value="draft.secondValue"
          :error="error.value"
          :select-value-reference="props.selectValueReference ? selectValueReference : undefined"
          @update:value="updateOperand($event)"
          @update:second-value="updateOperand($event, true)"
        />
        <ConditionalFormatRankCriteria
          v-else-if="draft.kind === 'rank'"
          v-model:bottom="draft.bottom"
          v-model:count="draft.count"
          v-model:percent="draft.percent"
          :error="error.value"
        />
        <ConditionalFormatAverageCriteria
          v-else-if="draft.kind === 'average'"
          v-model:above="draft.above"
          v-model:equal-average="draft.equalAverage"
          v-model:std-dev="draft.stdDev"
        />
        <ConditionalFormatDuplicateCriteria
          v-else-if="draft.kind === 'duplicate'"
          v-model:unique="draft.unique"
        />
        <div v-else-if="draft.kind === 'formula'" class="conditional-format-editor__formula">
          <RangeReferenceInput
            v-model="draft.formula"
            :label="t('conditionalFormatting.formulaDescription')"
            :show-picker="true"
            :insert-reference="true"
            :select-reference="props.selectValueReference ? selectValueReference : undefined"
            @enter="save"
          />
          <p v-if="error.formula" class="conditional-format-editor__error" role="alert">
            {{ error.formula }}
          </p>
        </div>
        <div v-if="hasInlineFormat" class="conditional-format-editor__rule-format">
          <span>{{ t("conditionalFormatting.preview") }}</span>
          <ConditionalFormatPreview
            wide
            control
            :format="format"
            :text="Object.keys(format).length ? undefined : t('conditionalFormatting.noFormat')"
          />
          <TButton variant="outline" @click="customVisible = true">{{
            t("conditionalFormatting.editFormat")
          }}</TButton>
        </div>
        <div
          v-if="draft.kind !== 'iconSet' && !hasInlineFormat"
          class="conditional-format-editor__preview"
        >
          <span>{{ t("conditionalFormatting.preview") }}</span
          ><ConditionalFormatPreview
            wide
            :condition="previewCondition"
            :format="category === 'visual' ? undefined : format"
          />
        </div>
      </section>
    </TForm>
    <template #footer>
      <DialogFooter :status="error.format" theme="error">
        <TButton theme="default" @click="emit('close')">{{
          t("conditionalFormatting.cancel")
        }}</TButton>
        <TButton theme="primary" @click="save">{{ t("conditionalFormatting.save") }}</TButton>
      </DialogFooter>
    </template>
  </Dialog>
  <ConditionalFormatStyleDialog
    v-if="hasInlineFormat && customVisible"
    :style="format"
    :sample-value="sampleValue"
    :date-system="dateSystem"
    @confirm="
      format = $event;
      customVisible = false;
    "
    @cancel="customVisible = false"
  />
  <DataBarAdvancedSettingsDialog
    :visible="dataBarAdvancedVisible"
    :settings="{
      negativeColor: draft.negativeColor,
      negativeBorderColor: draft.negativeBorderColor,
      axisPosition: draft.axisPosition,
      axisColor: draft.axisColor,
    }"
    :positive-border-color="draft.borderColor"
    @close="dataBarAdvancedVisible = false"
    @save="updateDataBarAdvancedSettings"
  />
</template>

<style scoped lang="scss">
@use "../../../shared/option-list/option-list" as option-list;

.conditional-format-editor {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
  height: min(614px, calc(100vh - 140px));
  min-width: 0;
  overflow: hidden;
  &__section {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  &__section--detail {
    @include option-list.scrollbar;
    align-content: start;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 10px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  h3 {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    font-weight: var(--sheetcraft-font-weight-semibold);
  }
  &__description {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__formula {
    display: grid;
    gap: 8px;
  }
  &__range {
    width: 100%;
  }
  &__rule-format {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    > span:first-child {
      text-align: left;
      color: var(--sheetcraft-text-secondary);
    }
  }
  &__preview {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    > span {
      text-align: left;
      color: var(--sheetcraft-text-secondary);
    }
  }
  &__error {
    color: var(--sheetcraft-status-error);
    margin: 0;
  }
}
</style>
