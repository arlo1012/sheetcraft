<script setup lang="ts">
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { computed, ref, watch } from "vue";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import {
  cloneConditionalFormatRule,
  conditionalFormatRangesIntersect,
  formatConditionalFormatRanges,
  parseConditionalFormatRanges,
} from "../conditional-formatting-ui";
import ConditionalFormatPreview from "./ConditionalFormatPreview.vue";
import ConditionalFormatEditorDialog, {
  type ConditionalFormatEditorKind,
} from "./ConditionalFormatEditorDialog.vue";

const props = defineProps<{
  visible: boolean;
  rules: readonly SheetConditionalFormatRule[];
  selectionRanges: string;
  createKind?: ConditionalFormatEditorKind;
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

function reset(): void {
  draftRules.value = props.rules.map(cloneConditionalFormatRule);
  scope.value = "selection";
  editorVisible.value = Boolean(props.createKind);
  editingRule.value = undefined;
}

function describeRule(rule: SheetConditionalFormatRule): string {
  const c = rule.condition;
  if (c.kind === "formula") return c.formula;
  if (c.kind === "blank")
    return c.blank ? t("conditionalFormatting.blanks") : t("conditionalFormatting.nonBlanks");
  if (c.kind === "duplicate")
    return c.unique ? t("conditionalFormatting.unique") : t("conditionalFormatting.duplicate");
  if (c.kind === "text")
    return `${t(`conditionalFormatting.${c.operator}` as "conditionalFormatting.contains")}: ${c.text}`;
  if (c.kind === "cellValue")
    return `${t(`conditionalFormatting.${c.operator}` as "conditionalFormatting.greaterThan")}: ${c.value}${c.secondValue === undefined ? "" : `, ${c.secondValue}`}`;
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
  editingRule.value = cloneConditionalFormatRule(rule);
  editorVisible.value = true;
}

function saveRule(rule: SheetConditionalFormatRule): void {
  const index = draftRules.value.findIndex((candidate) => candidate.id === rule.id);
  if (index < 0) draftRules.value.unshift(rule);
  else draftRules.value.splice(index, 1, rule);
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
  emit("save", draftRules.value.map(cloneConditionalFormatRule));
}
watch(() => [props.visible, props.rules, props.createKind], reset, {
  deep: true,
  immediate: true,
});
</script>

<template>
  <Dialog
    :visible="visible && !editorVisible"
    :header="t('conditionalFormatting.manageRules')"
    :confirm-btn="{ content: t('conditionalFormatting.save') }"
    :cancel-btn="t('conditionalFormatting.cancel')"
    width="min(720px, calc(100vw - 32px))"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <section class="conditional-format-manager">
      <div class="conditional-format-manager__toolbar">
        <span>{{ t("conditionalFormatting.ruleScope") }}</span>
        <TRadioGroup v-model="scope" variant="default-filled">
          <TRadio value="selection">{{ t("conditionalFormatting.selection") }}</TRadio>
          <TRadio value="sheet">{{ t("conditionalFormatting.sheet") }}</TRadio>
        </TRadioGroup>
        <TButton theme="primary" size="small" @click="addRule"
          ><template #icon><Plus :size="15" /></template
          >{{ t("conditionalFormatting.newRule") }}</TButton
        >
      </div>
      <div v-if="displayedRules.length" class="conditional-format-manager__rules">
        <article
          v-for="(rule, index) in displayedRules"
          :key="rule.id"
          class="conditional-format-manager__rule"
        >
          <ConditionalFormatPreview :condition="rule.condition" :format="rule.style" />
          <div class="conditional-format-manager__details">
            <strong>{{ describeRule(rule) }}</strong
            ><span
              >{{ t("conditionalFormatting.appliesTo") }}:
              {{ formatConditionalFormatRanges(rule.ranges) }}</span
            ><span v-if="rule.stopIfTrue">{{ t("conditionalFormatting.stopIfTrue") }}</span>
          </div>
          <div class="conditional-format-manager__actions">
            <TButton
              variant="text"
              size="small"
              :aria-label="t('conditionalFormatting.moveUp')"
              :title="t('conditionalFormatting.moveUp')"
              :disabled="scope !== 'sheet' || index === 0"
              @click="move(rule, -1)"
              ><template #icon><ArrowUp :size="15" /></template></TButton
            ><TButton
              variant="text"
              size="small"
              :aria-label="t('conditionalFormatting.moveDown')"
              :title="t('conditionalFormatting.moveDown')"
              :disabled="scope !== 'sheet' || index === displayedRules.length - 1"
              @click="move(rule, 1)"
              ><template #icon><ArrowDown :size="15" /></template></TButton
            ><TButton
              variant="text"
              size="small"
              :aria-label="t('conditionalFormatting.editRule')"
              :title="t('conditionalFormatting.editRule')"
              @click="editRule(rule)"
              ><template #icon><Pencil :size="15" /></template></TButton
            ><TButton
              variant="text"
              size="small"
              theme="danger"
              :aria-label="t('conditionalFormatting.deleteRule')"
              :title="t('conditionalFormatting.deleteRule')"
              @click="removeRule(rule)"
              ><template #icon><Trash2 :size="15" /></template
            ></TButton>
          </div>
        </article>
      </div>
      <p v-else class="conditional-format-manager__empty">
        {{ t("conditionalFormatting.noRules") }}
      </p>
    </section>
  </Dialog>
  <ConditionalFormatEditorDialog
    :visible="editorVisible"
    :rule="editingRule"
    :ranges="selectionRanges"
    :initial-kind="createKind"
    @save="saveRule"
    @close="closeEditor"
  />
</template>

<style scoped lang="scss">
.conditional-format-manager {
  display: grid;
  gap: 12px;
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    > :last-child {
      margin-left: auto;
    }
  }
  &__rules {
    display: grid;
    max-height: min(480px, calc(100vh - 240px));
    overflow: auto;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
  }
  &__rule {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid var(--idea-border-subtle);
    &:last-child {
      border-bottom: 0;
    }
  }

  &__details {
    display: grid;
    gap: 2px;
    min-width: 0;
    font-size: var(--idea-font-size-body-small);
    color: var(--idea-text-secondary);
    strong {
      color: var(--idea-text-primary);
      font-weight: 500;
    }
  }
  &__actions {
    display: flex;
  }
  &__empty {
    padding: 28px;
    margin: 0;
    color: var(--idea-text-secondary);
    text-align: center;
  }
}
</style>
