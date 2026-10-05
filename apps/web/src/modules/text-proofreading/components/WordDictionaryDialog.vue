<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { useAppI18n } from "../../../shared/i18n";
import DictionaryEntryTable from "./DictionaryEntryTable.vue";
import DictionaryManager from "./DictionaryManager.vue";
import {
  isSingleWordCategory,
  parseDictionaryText,
  serializeDictionaryText,
} from "../dictionary-transfer";
import type { DictionaryCategory, WordRule } from "../proofreading";
import type { useWordProofreading } from "../useWordProofreading";
const props = defineProps<{ controller: ReturnType<typeof useWordProofreading> }>();
const { t } = useAppI18n();
const entryRows = ref<WordRule[]>([{ word: "", replacement: "" }]);
const originalWord = ref<string>();
const returnTo = ref<"review" | "dictionary">();
const category = ref<DictionaryCategory>("accepted");
const word = ref("");
const builtins = ref(true);
const editingCategory = computed<DictionaryCategory>(() => {
  switch (props.controller.panel.value) {
    case "mistake":
      return "mistakes";
    case "sensitive":
      return "sensitive";
    case "term":
      return "terms";
    case "person":
      return "people";
    default:
      return "accepted";
  }
});
watch(
  () => props.controller.panel.value,
  (panel, previous) => {
    returnTo.value =
      panel !== "dictionary" &&
      panel !== "review" &&
      (previous === "review" || previous === "dictionary")
        ? previous
        : undefined;
    originalWord.value = undefined;
    word.value = "";
    entryRows.value = [{ word: "", replacement: "" }];
    builtins.value = props.controller.dictionary.value.builtins;
  },
  { flush: "sync" },
);
const visible = computed(
  () => !!props.controller.panel.value && props.controller.panel.value !== "review",
);
const title = computed(() => {
  switch (props.controller.panel.value) {
    case "accepted":
      return t(originalWord.value ? "wordProof.editAccepted" : "wordProof.accepted");
    case "mistake":
      return t(originalWord.value ? "wordProof.editMistake" : "wordProof.mistake");
    case "sensitive":
      return t(originalWord.value ? "wordProof.editSensitive" : "wordProof.addSensitive");
    case "term":
      return t(originalWord.value ? "wordProof.editTerm" : "wordProof.addTerm");
    case "person":
      return t(originalWord.value ? "wordProof.editPerson" : "wordProof.addPerson");
    case "settings":
      return t("wordProof.settings");
    default:
      return t("wordProof.dictionary");
  }
});
const isEditor = computed(
  () =>
    visible.value &&
    props.controller.panel.value !== "dictionary" &&
    props.controller.panel.value !== "settings",
);
const batchAccepted = computed(
  () => isSingleWordCategory(editingCategory.value) && !originalWord.value,
);
const firstLabel = computed(() =>
  t(
    editingCategory.value === "people"
      ? "wordProof.personName"
      : editingCategory.value === "terms"
        ? "wordProof.variant"
        : editingCategory.value === "sensitive"
          ? "wordProof.sensitive"
          : "wordProof.incorrectWord",
  ),
);
const secondLabel = computed(() =>
  t(
    editingCategory.value === "people"
      ? "wordProof.jobTitle"
      : editingCategory.value === "terms"
        ? "wordProof.standardTerm"
        : editingCategory.value === "sensitive"
          ? "wordProof.optionalReplacement"
          : "wordProof.replacement",
  ),
);
const editorHint = computed(() =>
  t(
    batchAccepted.value
      ? "wordProof.batchHint"
      : isSingleWordCategory(editingCategory.value)
        ? "wordProof.wordHint"
        : "wordProof.pairEntryHint",
  ),
);
function openEntry(target: DictionaryCategory, entries?: WordRule[], original?: string) {
  category.value = target;
  props.controller.open(
    target === "accepted"
      ? "accepted"
      : target === "mistakes"
        ? "mistake"
        : target === "sensitive"
          ? "sensitive"
          : target === "terms"
            ? "term"
            : "person",
  );
  originalWord.value = original;
  if (entries) {
    word.value = original ? entries[0]!.word : serializeDictionaryText(entries, "accepted");
    entryRows.value = entries.map((row) => ({ ...row }));
  }
}
function saveWord() {
  const target = editingCategory.value;
  let entries = entryRows.value;
  if (isSingleWordCategory(target)) {
    try {
      entries = originalWord.value
        ? [{ word: word.value, replacement: "" }]
        : parseDictionaryText(word.value, target);
    } catch {
      props.controller.error.value = t("wordProof.invalidWord");
      return;
    }
  }
  if (props.controller.addEntries(target, entries, originalWord.value)) {
    category.value = target;
    finishEditor(true);
  }
}
function finishEditor(saved = false) {
  const target = returnTo.value;
  props.controller.panel.value = target ?? (saved ? "dictionary" : undefined);
  if (saved && target === "review") props.controller.scan();
}
function editEntry(target: DictionaryCategory, entry: WordRule) {
  openEntry(target, [entry], entry.word);
}
</script>
<template>
  <Dialog
    :visible="visible"
    :header="title"
    :width="
      controller.panel.value === 'dictionary'
        ? '820px'
        : isEditor && !isSingleWordCategory(editingCategory)
          ? '660px'
          : '520px'
    "
    :footer="controller.panel.value !== 'dictionary'"
    :close-on-overlay-click="false"
    @close="finishEditor()"
  >
    <div class="word-dictionary">
      <p v-if="controller.error.value" role="alert">{{ controller.error.value }}</p>
      <template v-if="isEditor">
        <Textarea
          v-if="batchAccepted"
          v-model="word"
          :aria-label="t('wordProof.word')"
          :autosize="{ minRows: 5, maxRows: 10 }"
          :placeholder="t('wordProof.singleWordPlaceholder')"
        />
        <DictionaryEntryTable
          v-else-if="!isSingleWordCategory(editingCategory)"
          v-model="entryRows"
          :first-label="firstLabel"
          :second-label="secondLabel"
        />
        <Form v-else label-align="top"
          ><FormItem :label="t('wordProof.word')"
            ><Input v-model="word" :maxlength="100" /></FormItem
        ></Form>
      </template>
      <DictionaryManager
        v-else-if="controller.panel.value === 'dictionary'"
        v-model="category"
        :dictionary="controller.dictionary.value"
        @add="openEntry"
        @edit="editEntry"
        @remove="controller.removeEntries"
      />
      <template v-else-if="controller.panel.value === 'settings'">
        <p>{{ t("wordProof.hint") }}</p>
        <p>{{ t("wordProof.localHint") }}</p>
        <Checkbox v-model="builtins">{{ t("wordProof.enableBuiltin") }}</Checkbox>
      </template>
    </div>
    <template #footer>
      <div class="word-dictionary__footer">
        <span v-if="isEditor" class="word-dictionary__hint">{{ editorHint }}</span>
        <div class="word-dictionary__footer-actions">
          <Button theme="default" @click="finishEditor()">{{ t("wordProof.cancel") }}</Button>
          <Button
            theme="primary"
            @click="
              controller.panel.value === 'settings'
                ? controller.save({ ...controller.dictionary.value, builtins }) &&
                  (controller.panel.value = undefined)
                : saveWord()
            "
            >{{ t("wordProof.save") }}</Button
          >
        </div>
      </div>
    </template>
  </Dialog>
</template>
<style scoped lang="scss">
.word-dictionary {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__footer {
    display: flex;
    align-items: center;
    gap: 16px;
    text-align: left;
  }
  &__hint {
    color: var(--idea-text-secondary);
    flex: 1;
  }
  &__footer-actions {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
  }
}
</style>
