<script setup lang="ts">
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { computed, ref, watch } from "vue";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-vue-next";
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
import ConditionalFormatEditorDialog, {
  type ConditionalFormatEditorKind,
} from "./ConditionalFormatEditorDialog.vue";

const props = defineProps<{
  visible: boolean;
  rules: readonly SheetConditionalFormatRule[];
  selectionRanges: string;
  createKind?: ConditionalFormatEditorKind;
  sampleValue?: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
  selectReference?: (current: string) => Promise<string | undefined>;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  close: [];
  save: [rules: SheetConditionalFormatRule[]];
}>();
const { t } = useAppI18n();
const scope = ref<"selection" | "sheet">("selection");
const editingRule = ref<SheetConditionalFormatRule>();
const editorVisible = ref(false);
const draftRules = ref<SheetConditionalFormatRule[]>([]);
const selectedId = ref<string>();
const rangeDrafts = ref<Record<string, string>>({});
const rangeErrors = ref<Record<string, string>>({});
const error = ref("");
const pickingRange = ref(false);
let editSession = 0;

const displayedRules = computed(() =>
  scope.value === "sheet"
    ? draftRules.value
    : draftRules.value.filter((rule) =>
        conditionalFormatRangesIntersect(
          rule.ranges,
          parseConditionalFormatRanges(props.selectionRanges) ?? [],
        ),
      ),
);
const selectedRule = computed(() =>
  displayedRules.value.find((rule) => rule.id === selectedId.value),
);
const selectedIndex = computed(() =>
  displayedRules.value.findIndex((rule) => rule.id === selectedId.value),
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
  draftRules.value = props.rules.map(cloneConditionalFormatRule);
  rangeDrafts.value = Object.fromEntries(
    draftRules.value.map((rule) => [rule.id, formatConditionalFormatRanges(rule.ranges)]),
  );
  rangeErrors.value = {};
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
  editingRule.value = undefined;
  editorVisible.value = true;
}

function editRule(rule: SheetConditionalFormatRule): void {
  const ranges = readRanges(rule);
  if (!ranges) return;
  selectedId.value = rule.id;
  editingRule.value = cloneConditionalFormatRule({ ...rule, ranges });
  editorVisible.value = true;
}
function editSelected(): void {
  if (selectedRule.value) editRule(selectedRule.value);
}
function editRow(id: string): void {
  const rule = displayedRules.value.find((candidate) => candidate.id === id);
  if (rule) editRule(rule);
}
function updateRange(id: string, value: string): void {
  rangeDrafts.value[id] = value;
  delete rangeErrors.value[id];
}
function readRanges(rule: SheetConditionalFormatRule) {
  const input = rangeDrafts.value[rule.id] ?? formatConditionalFormatRanges(rule.ranges);
  const ranges = parseConditionalFormatRanges(input.trim().replace(/^=/, ""));
  if (!ranges) rangeErrors.value[rule.id] = t("conditionalFormatting.invalidRange");
  return ranges;
}
function updateStop(id: string, value: boolean): void {
  const index = draftRules.value.findIndex((rule) => rule.id === id);
  const rule = draftRules.value[index];
  if (!rule || ["dataBar", "colorScale", "iconSet"].includes(rule.condition.kind)) return;
  try {
    draftRules.value[index] = cloneConditionalFormatRule({ ...rule, stopIfTrue: value });
    error.value = "";
  } catch {
    error.value = t("conditionalFormatting.invalidFormat");
  }
}
async function selectRange(current: string): Promise<string | undefined> {
  const session = editSession;
  pickingRange.value = true;
  try {
    const selected = await props.selectReference?.(current);
    return session === editSession ? selected : undefined;
  } finally {
    if (session === editSession) pickingRange.value = false;
  }
}

function saveRule(rule: SheetConditionalFormatRule): void {
  const index = draftRules.value.findIndex((candidate) => candidate.id === rule.id);
  if (index < 0) draftRules.value.unshift(rule);
  else draftRules.value.splice(index, 1, rule);
  rangeDrafts.value[rule.id] = formatConditionalFormatRanges(rule.ranges);
  delete rangeErrors.value[rule.id];
  selectedId.value = rule.id;
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

function removeRule(rule: SheetConditionalFormatRule): void {
  draftRules.value = draftRules.value.filter((candidate) => candidate.id !== rule.id);
  delete rangeDrafts.value[rule.id];
  delete rangeErrors.value[rule.id];
}
function removeSelected(): void {
  if (selectedRule.value) removeRule(selectedRule.value);
}
function moveSelected(offset: -1 | 1): void {
  if (selectedRule.value) move(selectedRule.value, offset);
}

function move(rule: SheetConditionalFormatRule, offset: -1 | 1): void {
  if (scope.value !== "sheet") return;
  const index = draftRules.value.findIndex((candidate) => candidate.id === rule.id);
  const displayedIndex = displayedRules.value.findIndex((candidate) => candidate.id === rule.id);
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
}

function save(): void {
  rangeErrors.value = {};
  const rules: SheetConditionalFormatRule[] = [];
  for (const rule of draftRules.value) {
    const ranges = readRanges(rule);
    if (ranges) rules.push(cloneConditionalFormatRule({ ...rule, ranges }));
  }
  if (Object.keys(rangeErrors.value).length) {
    // A range draft may belong to a row hidden by the selection scope.
    scope.value = "sheet";
    selectedId.value = Object.keys(rangeErrors.value)[0];
    return;
  }
  emit("save", rules);
}
watch(displayedRules, (rules) => {
  if (!rules.some((rule) => rule.id === selectedId.value)) selectedId.value = rules[0]?.id;
});
watch(() => [props.visible, props.rules, props.createKind], reset, {
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
    width="min(900px, calc(100vw - 32px))"
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
          :aria-label="t('conditionalFormatting.ruleScope')"
          :options="[
            { value: 'selection', label: t('conditionalFormatting.selection') },
            { value: 'sheet', label: t('conditionalFormatting.sheet') },
          ]"
        />
      </div>
      <div class="conditional-format-manager__toolbar">
        <TButton
          variant="outline"
          data-cf-action="new"
          :aria-label="t('conditionalFormatting.newRule')"
          @click="addRule"
        >
          <template #icon><Plus /></template>{{ t("conditionalFormatting.newRuleAction") }}
        </TButton>
        <TButton
          variant="outline"
          data-cf-action="edit"
          :aria-label="t('conditionalFormatting.editRule')"
          :disabled="!selectedRule"
          @click="editSelected"
        >
          <template #icon><Pencil /></template>{{ t("conditionalFormatting.editRuleAction") }}
        </TButton>
        <TButton
          variant="outline"
          data-cf-action="delete"
          :aria-label="t('conditionalFormatting.deleteRule')"
          :disabled="!selectedRule"
          @click="removeSelected"
        >
          <template #icon><Trash2 /></template>{{ t("conditionalFormatting.deleteRule") }}
        </TButton>
        <TButton
          variant="outline"
          shape="square"
          data-cf-action="up"
          :aria-label="t('conditionalFormatting.moveUp')"
          :title="t('conditionalFormatting.moveUp')"
          :disabled="scope !== 'sheet' || selectedIndex <= 0"
          @click="moveSelected(-1)"
        >
          <template #icon><ArrowUp /></template>
        </TButton>
        <TButton
          variant="outline"
          shape="square"
          data-cf-action="down"
          :aria-label="t('conditionalFormatting.moveDown')"
          :title="t('conditionalFormatting.moveDown')"
          :disabled="
            scope !== 'sheet' || selectedIndex < 0 || selectedIndex >= displayedRules.length - 1
          "
          @click="moveSelected(1)"
        >
          <template #icon><ArrowDown /></template>
        </TButton>
      </div>
      <ConditionalFormatRulesTable
        :rows="tableRows"
        :selected-id="selectedId"
        :select-reference="props.selectReference ? selectRange : undefined"
        @select="selectedId = $event"
        @edit="editRow"
        @update-range="updateRange"
        @update-stop="updateStop"
      />
      <p v-if="error" class="conditional-format-manager__error" role="alert">{{ error }}</p>
    </section>
  </Dialog>
  <ConditionalFormatQuickDialog
    v-if="editorVisible && isConditionalFormatQuickDialogKind(createKind) && !editingRule"
    :kind="createKind"
    :ranges="selectionRanges"
    :sample-value="sampleValue"
    :date-system="dateSystem"
    :select-value-reference="selectValueReference"
    @save="saveRule"
    @close="closeEditor"
  />
  <ConditionalFormatEditorDialog
    v-else
    :visible="editorVisible"
    :rule="editingRule"
    :ranges="selectionRanges"
    :initial-kind="createKind"
    :sample-value="sampleValue"
    :date-system="dateSystem"
    :select-reference="selectReference"
    :select-value-reference="selectValueReference"
    @save="saveRule"
    @close="closeEditor"
  />
</template>

<style scoped lang="scss">
.conditional-format-manager {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
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
  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    svg {
      width: var(--idea-action-icon-size);
      height: var(--idea-action-icon-size);
      stroke-width: var(--idea-icon-stroke-width);
    }
  }
  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
}
</style>
