<script setup lang="ts">
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { computed, ref, watch } from "vue";
import { Plus } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import {
  cloneConditionalFormatRule,
  conditionalFormatRangesIntersect,
  formatConditionalFormatValueOperand,
  formatConditionalFormatRanges,
  parseConditionalFormatRanges,
} from "../conditional-formatting-ui";
import ConditionalFormatQuickDialog from "./ConditionalFormatQuickDialog.vue";
import { isConditionalFormatQuickDialogKind } from "../conditional-format-quick-rules";
import ConditionalFormatRulesTable from "./ConditionalFormatRulesTable.vue";
import type {
  ConditionalFormatManagerSheet,
  ConditionalFormatSheetChange,
} from "../conditional-format-manager-types";
import ConditionalFormatEditorDialog, {
  type ConditionalFormatEditorKind,
} from "./ConditionalFormatEditorDialog.vue";

const props = defineProps<{
  visible: boolean;
  rules: readonly SheetConditionalFormatRule[];
  sheets?: readonly ConditionalFormatManagerSheet[];
  sheetId?: string;
  selectionRanges: string;
  createKind?: ConditionalFormatEditorKind;
  sampleValue?: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
  selectReference?: (current: string, sheetId?: string) => Promise<string | undefined>;
  selectValueReference?: (current: string, sheetId?: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  close: [];
  save: [rules: SheetConditionalFormatRule[]];
  saveSheets: [changes: ConditionalFormatSheetChange[]];
}>();
const { t } = useAppI18n();
const scope = ref("selection");
const editingRule = ref<SheetConditionalFormatRule>();
const editorVisible = ref(false);
const selectedId = ref<string>();
type SheetDraft = {
  rules: SheetConditionalFormatRule[];
  ranges: Record<string, string>;
  errors: Record<string, string>;
  dirty: boolean;
};
const sheetDrafts = ref(new Map<string, SheetDraft>());
const initialSheetId = computed(() => props.sheetId ?? "current");
const currentSheetId = computed(() =>
  scope.value.startsWith("sheet:") ? scope.value.slice(6) : initialSheetId.value,
);
const currentSheet = computed(() =>
  props.sheets?.find((sheet) => sheet.id === currentSheetId.value),
);
const readonly = computed(() => Boolean(currentSheet.value?.protected));
const currentDraft = computed(() => sheetDrafts.value.get(currentSheetId.value)!);
const draftRules = computed({
  get: () => currentDraft.value?.rules ?? [],
  set: (value: SheetConditionalFormatRule[]) => {
    currentDraft.value.rules = value;
  },
});
const rangeDrafts = computed(() => currentDraft.value.ranges);
const rangeErrors = computed(() => currentDraft.value.errors);
const scopeOptions = computed(() => [
  { value: "selection", label: t("conditionalFormatting.selection") },
  { value: "sheet", label: t("conditionalFormatting.sheet") },
  ...(props.sheets ?? []).map((sheet) => ({
    value: `sheet:${sheet.id}`,
    label: t("conditionalFormatting.sheetScope", { name: sheet.name }),
  })),
]);
const editorSelectionRanges = computed(
  () => currentSheet.value?.selectionRanges ?? props.selectionRanges,
);
const error = ref("");
const pickingRange = ref(false);
let editSession = 0;

const displayedRules = computed(() =>
  scope.value === "selection"
    ? draftRules.value.filter((rule) =>
        conditionalFormatRangesIntersect(
          rule.ranges,
          parseConditionalFormatRanges(props.selectionRanges) ?? [],
        ),
      )
    : draftRules.value,
);
const tableRows = computed(() =>
  displayedRules.value.map((rule) => ({
    id: rule.id,
    rule,
    description: describeRule(rule),
    rangeText: rangeDrafts.value[rule.id] ?? formatConditionalFormatRanges(rule.ranges),
    rangeError: rangeErrors.value[rule.id],
  })),
);

function reset(): void {
  editSession += 1;
  const drafts = new Map<string, SheetDraft>();
  const addSheet = (id: string, source: readonly SheetConditionalFormatRule[]) => {
    const rules = source.map(cloneConditionalFormatRule);
    drafts.set(id, {
      rules,
      ranges: Object.fromEntries(
        rules.map((rule) => [rule.id, formatConditionalFormatRanges(rule.ranges)]),
      ),
      errors: {},
      dirty: false,
    });
  };
  for (const sheet of props.sheets ?? []) addSheet(sheet.id, sheet.rules);
  if (!drafts.has(initialSheetId.value)) addSheet(initialSheetId.value, props.rules);
  sheetDrafts.value = drafts;
  error.value = "";
  pickingRange.value = false;
  scope.value = "selection";
  selectedId.value = displayedRules.value[0]?.id;
  editorVisible.value = Boolean(props.createKind);
  editingRule.value = undefined;
}

function describeRule(rule: SheetConditionalFormatRule): string {
  const c = rule.condition;
  if (c.kind === "error")
    return c.error ? t("conditionalFormatting.errors") : t("conditionalFormatting.nonErrors");
  if (c.kind === "formula") return c.formula;
  if (c.kind === "blank")
    return c.blank ? t("conditionalFormatting.blanks") : t("conditionalFormatting.nonBlanks");
  if (c.kind === "duplicate")
    return c.unique ? t("conditionalFormatting.unique") : t("conditionalFormatting.duplicate");
  if (c.kind === "text")
    return `${t(`conditionalFormatting.${c.operator}` as "conditionalFormatting.contains")}: ${formatConditionalFormatValueOperand(c.text).value}`;
  if (c.kind === "cellValue") {
    const value = formatConditionalFormatValueOperand(c.value).value;
    const secondValue =
      c.secondValue === undefined
        ? undefined
        : formatConditionalFormatValueOperand(c.secondValue).value;
    return `${t(`conditionalFormatting.${c.operator}` as "conditionalFormatting.greaterThan")}: ${value}${secondValue === undefined ? "" : `, ${secondValue}`}`;
  }
  if (c.kind === "rank")
    return `${c.bottom ? t("conditionalFormatting.bottom") : t("conditionalFormatting.top")}: ${c.count}${c.percent ? "%" : ""}`;
  if (c.kind === "average")
    return c.above
      ? t("conditionalFormatting.aboveAverage")
      : t("conditionalFormatting.belowAverage");
  if (c.kind === "date")
    return t(`conditionalFormatting.${c.period}` as "conditionalFormatting.today");
  if (c.kind === "dataBar") return t("conditionalFormatting.dataBars");
  if (c.kind === "colorScale") return t("conditionalFormatting.colorScales");
  return `${t("conditionalFormatting.iconSets")}: ${t(`conditionalFormatting.${c.iconSet}` as "conditionalFormatting.threeArrows")}`;
}
function addRule(): void {
  if (readonly.value) return;
  editingRule.value = undefined;
  editorVisible.value = true;
}

function editRule(rule: SheetConditionalFormatRule): void {
  if (readonly.value) return;
  const ranges = readRanges(rule);
  if (!ranges) return;
  selectedId.value = rule.id;
  editingRule.value = cloneConditionalFormatRule({ ...rule, ranges });
  editorVisible.value = true;
}
function editRow(id: string): void {
  const rule = displayedRules.value.find((candidate) => candidate.id === id);
  if (rule) editRule(rule);
}
function updateRange(id: string, value: string): void {
  if (readonly.value) return;
  rangeDrafts.value[id] = value;
  currentDraft.value.dirty = true;
  delete rangeErrors.value[id];
}
function readRanges(rule: SheetConditionalFormatRule) {
  const input = rangeDrafts.value[rule.id] ?? formatConditionalFormatRanges(rule.ranges);
  const ranges = parseConditionalFormatRanges(input.trim().replace(/^=/, ""));
  if (!ranges) rangeErrors.value[rule.id] = t("conditionalFormatting.invalidRange");
  return ranges;
}
function updateStop(id: string, value: boolean): void {
  if (readonly.value) return;
  const index = draftRules.value.findIndex((rule) => rule.id === id);
  const rule = draftRules.value[index];
  if (!rule || ["dataBar", "colorScale", "iconSet"].includes(rule.condition.kind)) return;
  try {
    draftRules.value[index] = cloneConditionalFormatRule({ ...rule, stopIfTrue: value });
    currentDraft.value.dirty = true;
    error.value = "";
  } catch {
    error.value = t("conditionalFormatting.invalidFormat");
  }
}
async function selectRange(current: string): Promise<string | undefined> {
  const session = editSession;
  pickingRange.value = true;
  try {
    const selected = await props.selectReference?.(
      current,
      props.sheetId ? currentSheetId.value : undefined,
    );
    return session === editSession ? selected : undefined;
  } finally {
    if (session === editSession) pickingRange.value = false;
  }
}
async function selectValueRange(current: string): Promise<string | undefined> {
  return props.selectValueReference?.(current, props.sheetId ? currentSheetId.value : undefined);
}

function saveRule(rule: SheetConditionalFormatRule): void {
  if (readonly.value) return;
  const index = draftRules.value.findIndex((candidate) => candidate.id === rule.id);
  if (index < 0) draftRules.value.unshift(rule);
  else draftRules.value.splice(index, 1, rule);
  rangeDrafts.value[rule.id] = formatConditionalFormatRanges(rule.ranges);
  delete rangeErrors.value[rule.id];
  selectedId.value = rule.id;
  currentDraft.value.dirty = true;
  if (props.createKind) {
    emit("save", draftRules.value.map(cloneConditionalFormatRule));
    return;
  }
  editorVisible.value = false;
}

function closeEditor(): void {
  if (props.createKind) emit("close");
  else editorVisible.value = false;
}

function removeRule(id: string): void {
  if (readonly.value) return;
  draftRules.value = draftRules.value.filter((candidate) => candidate.id !== id);
  delete rangeDrafts.value[id];
  delete rangeErrors.value[id];
  currentDraft.value.dirty = true;
}

function move(id: string, offset: -1 | 1): void {
  if (scope.value === "selection" || readonly.value) return;
  const index = draftRules.value.findIndex((candidate) => candidate.id === id);
  const displayedIndex = displayedRules.value.findIndex((candidate) => candidate.id === id);
  const nextDisplayedIndex = displayedIndex + offset;
  if (index < 0 || displayedIndex < 0 || nextDisplayedIndex < 0) return;
  const neighbor = displayedRules.value[nextDisplayedIndex];
  if (!neighbor) return;
  const neighborIndex = draftRules.value.findIndex((candidate) => candidate.id === neighbor.id);
  if (neighborIndex < 0) return;
  [draftRules.value[index], draftRules.value[neighborIndex]] = [
    draftRules.value[neighborIndex]!,
    draftRules.value[index]!,
  ];
  currentDraft.value.dirty = true;
}

function save(): void {
  const changes: ConditionalFormatSheetChange[] = [];
  for (const [sheetId, draft] of sheetDrafts.value) {
    if (props.sheets && !draft.dirty) continue;
    draft.errors = {};
    const rules: SheetConditionalFormatRule[] = [];
    for (const rule of draft.rules) {
      const input = draft.ranges[rule.id] ?? formatConditionalFormatRanges(rule.ranges);
      const ranges = parseConditionalFormatRanges(input.trim().replace(/^=/, ""));
      if (ranges) rules.push(cloneConditionalFormatRule({ ...rule, ranges }));
      else draft.errors[rule.id] = t("conditionalFormatting.invalidRange");
    }
    if (Object.keys(draft.errors).length) {
      scope.value = sheetId === initialSheetId.value ? "sheet" : `sheet:${sheetId}`;
      selectedId.value = Object.keys(draft.errors)[0];
      return;
    }
    changes.push({ sheetId, rules });
  }
  if (props.sheets) emit("saveSheets", changes);
  else emit("save", changes[0]?.rules ?? []);
}
watch(displayedRules, (rules) => {
  if (!rules.some((rule) => rule.id === selectedId.value)) selectedId.value = rules[0]?.id;
});
watch(() => [props.visible, props.rules, props.createKind, props.sheets, props.sheetId], reset, {
  deep: true,
  immediate: true,
});
</script>

<template>
  <Dialog
    :visible="visible && !editorVisible && !pickingRange"
    :header="t('conditionalFormatting.manageRules')"
    :confirm-btn="{ content: t('conditionalFormatting.save') }"
    :cancel-btn="t('conditionalFormatting.cancel')"
    width="min(1000px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <section class="conditional-format-manager">
      <div
        class="conditional-format-manager__scope"
        role="group"
        :aria-label="t('conditionalFormatting.ruleScope')"
      >
        <span>{{ t("conditionalFormatting.ruleScope") }}</span>
        <TSelect
          v-model="scope"
          class="conditional-format-manager__scope-select"
          data-cf-scope
          filterable
          :aria-label="t('conditionalFormatting.ruleScope')"
          :options="scopeOptions"
        />
        <TButton
          class="conditional-format-manager__new"
          variant="outline"
          data-cf-action="new"
          :aria-label="t('conditionalFormatting.newRule')"
          :disabled="readonly"
          @click="addRule"
        >
          <template #icon><Plus class="idea-action-icon" aria-hidden="true" /></template>
          {{ t("conditionalFormatting.newRuleAction") }}
        </TButton>
      </div>
      <ConditionalFormatRulesTable
        :rows="tableRows"
        :reorderable="scope !== 'selection'"
        :readonly="readonly"
        :selected-id="selectedId"
        :select-reference="props.selectReference ? selectRange : undefined"
        @select="selectedId = $event"
        @edit="editRow"
        @remove="removeRule"
        @move="move"
        @update-range="updateRange"
        @update-stop="updateStop"
      />
      <p v-if="error" class="conditional-format-manager__error" role="alert">{{ error }}</p>
    </section>
  </Dialog>
  <ConditionalFormatQuickDialog
    v-if="editorVisible && isConditionalFormatQuickDialogKind(createKind) && !editingRule"
    :kind="createKind"
    :ranges="editorSelectionRanges"
    :sample-value="currentSheetId === initialSheetId ? sampleValue : undefined"
    :date-system="dateSystem"
    :select-value-reference="props.selectValueReference ? selectValueRange : undefined"
    @save="saveRule"
    @close="closeEditor"
  />
  <ConditionalFormatEditorDialog
    v-else
    :visible="editorVisible"
    :rule="editingRule"
    :ranges="editorSelectionRanges"
    :initial-kind="createKind"
    :sample-value="currentSheetId === initialSheetId ? sampleValue : undefined"
    :date-system="dateSystem"
    :select-reference="props.selectReference ? selectRange : undefined"
    :select-value-reference="props.selectValueReference ? selectValueRange : undefined"
    @save="saveRule"
    @close="closeEditor"
  />
</template>

<style scoped lang="scss">
.conditional-format-manager {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: min(340px, calc(100dvh - 180px));
  min-height: 0;
  gap: 12px;
  &__scope {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &__scope-select {
    width: 180px;
  }
  &__new {
    margin-left: auto;
    flex-shrink: 0;
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
}
</style>
