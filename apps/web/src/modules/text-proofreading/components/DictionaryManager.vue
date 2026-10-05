<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Tooltip } from "tdesign-vue-next/es/tooltip";
import { PrimaryTable } from "tdesign-vue-next/es/table";
import type { PrimaryTableCol } from "tdesign-vue-next/es/table/type";
import { Search, Plus, Trash2, Info, Upload, Download } from "lucide-vue-next";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
import {
  builtinRules,
  type DictionaryCategory,
  type WordDictionary,
  type WordRule,
} from "../proofreading";
import {
  dictionaryEntries,
  downloadDictionaryText,
  parseDictionaryText,
} from "../dictionary-transfer";
const props = defineProps<{ dictionary: WordDictionary }>();
const category = defineModel<DictionaryCategory>({ required: true });
const emit = defineEmits<{
  add: [category: DictionaryCategory, entries?: WordRule[]];
  edit: [category: DictionaryCategory, entry: WordRule];
  remove: [category: DictionaryCategory, words: string[]];
}>();
const { t } = useAppI18n();
const query = ref("");
const selected = ref<string[]>([]);
const showBuiltins = ref(false);
const fileInput = ref<HTMLInputElement>();
const importError = ref("");
const reading = ref(false);
let importToken = 0;
onBeforeUnmount(() => {
  importToken++;
});
const title = computed(() =>
  t(
    category.value === "accepted"
      ? "wordProof.correctWord"
      : category.value === "mistakes"
        ? "wordProof.incorrectWord"
        : category.value === "sensitive"
          ? "wordProof.sensitive"
          : category.value === "terms"
            ? "wordProof.terms"
            : "wordProof.people",
  ),
);
const hint = computed(() =>
  t(
    category.value === "accepted"
      ? "wordProof.acceptedRuleHint"
      : category.value === "mistakes"
        ? "wordProof.mistakesRuleHint"
        : category.value === "sensitive"
          ? "wordProof.sensitiveRuleHint"
          : category.value === "terms"
            ? "wordProof.termsRuleHint"
            : "wordProof.peopleRuleHint",
  ),
);
const firstLabel = computed(() =>
  t(
    category.value === "people"
      ? "wordProof.personName"
      : category.value === "terms"
        ? "wordProof.variant"
        : "wordProof.word",
  ),
);
const secondLabel = computed(() =>
  t(
    category.value === "people"
      ? "wordProof.jobTitle"
      : category.value === "terms"
        ? "wordProof.standardTerm"
        : "wordProof.replacement",
  ),
);
const entries = computed(() => dictionaryEntries(props.dictionary, category.value));
const rows = computed(() => {
  const items = entries.value.map((row) => ({ ...row, id: `custom:${row.word}`, builtin: false }));
  if (category.value === "mistakes" && showBuiltins.value)
    items.push(
      ...builtinRules.map((row) => ({ ...row, id: `builtin:${row.word}`, builtin: true })),
    );
  const search = query.value.trim().toLocaleLowerCase();
  return items.filter(
    (row) => !search || `${row.word}\n${row.replacement}`.toLocaleLowerCase().includes(search),
  );
});
const columns = computed<PrimaryTableCol[]>(() => [
  { colKey: "select", type: "multiple", width: 40, disabled: ({ row }) => row.builtin },
  { colKey: "word", title: firstLabel.value, ellipsis: true },
  ...(category.value === "accepted"
    ? []
    : [{ colKey: "replacement", title: secondLabel.value, ellipsis: true }]),
  { colKey: "actions", title: "", width: 90 },
]);
const selectedWords = computed(() =>
  rows.value
    .filter((row) => !row.builtin && selected.value.includes(row.id))
    .map((row) => row.word),
);
watch([category, query, showBuiltins], () => {
  selected.value = [];
  importError.value = "";
  importToken++;
  reading.value = false;
});
watch(
  () => props.dictionary,
  () => {
    selected.value = [];
  },
);
function exportEntries() {
  const words = new Set(selectedWords.value);
  const exported = words.size ? entries.value.filter((row) => words.has(row.word)) : entries.value;
  downloadDictionaryText(exported, category.value, title.value);
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const token = ++importToken;
  const target = category.value;
  reading.value = true;
  importError.value = "";
  try {
    if (file.size > 2_000_000) throw new Error("large-file");
    const text = await file.text();
    if (token !== importToken) return;
    emit("add", target, parseDictionaryText(text, target));
  } catch {
    if (token === importToken) importError.value = t("wordProof.importError");
  } finally {
    if (token === importToken) reading.value = false;
  }
}
</script>
<template>
  <div class="dictionary-manager">
    <nav class="dictionary-manager__nav" :aria-label="t('wordProof.dictionary')">
      <Button
        :variant="category === 'accepted' ? 'outline' : 'text'"
        :theme="category === 'accepted' ? 'primary' : 'default'"
        :aria-current="category === 'accepted' ? 'page' : undefined"
        @click="category = 'accepted'"
        >{{ t("wordProof.correctWord") }}</Button
      >
      <Button
        :variant="category === 'mistakes' ? 'outline' : 'text'"
        :theme="category === 'mistakes' ? 'primary' : 'default'"
        :aria-current="category === 'mistakes' ? 'page' : undefined"
        @click="category = 'mistakes'"
        >{{ t("wordProof.incorrectWord") }}</Button
      >
      <Button
        :variant="category === 'sensitive' ? 'outline' : 'text'"
        :theme="category === 'sensitive' ? 'primary' : 'default'"
        :aria-current="category === 'sensitive' ? 'page' : undefined"
        @click="category = 'sensitive'"
        >{{ t("wordProof.sensitive") }}</Button
      >
      <Button
        :variant="category === 'terms' ? 'outline' : 'text'"
        :theme="category === 'terms' ? 'primary' : 'default'"
        :aria-current="category === 'terms' ? 'page' : undefined"
        @click="category = 'terms'"
        >{{ t("wordProof.terms") }}</Button
      >
      <Button
        :variant="category === 'people' ? 'outline' : 'text'"
        :theme="category === 'people' ? 'primary' : 'default'"
        :aria-current="category === 'people' ? 'page' : undefined"
        @click="category = 'people'"
        >{{ t("wordProof.people") }}</Button
      >
    </nav>
    <section class="dictionary-manager__content" :aria-label="title">
      <div class="dictionary-manager__header">
        <strong>{{ title }}</strong>
        <Tooltip :content="hint"
          ><Button size="small" variant="text" theme="default" :aria-label="hint"
            ><Info :size="14" /></Button
        ></Tooltip>
        <div class="dictionary-manager__transfer">
          <Tooltip :content="t('wordProof.importHint')"
            ><Button theme="default" :loading="reading" @click="fileInput?.click()"
              ><template #icon><Upload :size="14" /></template>{{ t("wordProof.import") }}</Button
            ></Tooltip
          >
          <Button theme="default" :disabled="!entries.length" @click="exportEntries"
            ><template #icon><Download :size="14" /></template
            >{{ t(selectedWords.length ? "wordProof.exportSelected" : "wordProof.export") }}</Button
          >
          <input
            ref="fileInput"
            hidden
            type="file"
            accept=".txt,.tsv,text/plain,text/tab-separated-values"
            @change="importFile"
          />
        </div>
      </div>
      <div class="dictionary-manager__toolbar">
        <span class="dictionary-manager__count">{{
          t("wordProof.entryCount", { selected: selectedWords.length, count: rows.length })
        }}</span>
        <Input
          v-model="query"
          clearable
          :placeholder="t('wordProof.search')"
          :aria-label="t('wordProof.search')"
          class="dictionary-manager__search"
          ><template #prefix-icon><Search :size="14" /></template
        ></Input>
        <Button variant="text" theme="primary" @click="emit('add', category)"
          ><template #icon><Plus :size="14" /></template>{{ t("wordProof.addEntry") }}</Button
        >
        <Button
          variant="text"
          theme="default"
          :disabled="!selectedWords.length"
          @click="emit('remove', category, selectedWords)"
          ><template #icon><Trash2 :size="14" /></template>{{ t("wordProof.remove") }}</Button
        >
      </div>
      <p v-if="importError" role="alert">{{ importError }}</p>
      <div class="dictionary-manager__table">
        <TableHeightWrapper v-slot="{ height }">
          <PrimaryTable
            class="idea-table--mini idea-table--row-dividers"
            size="small"
            row-key="id"
            :data="rows"
            :columns="columns"
            :height="height"
            :selected-row-keys="selected"
            :empty="t(query ? 'wordProof.noEntriesFound' : 'wordProof.noEntries')"
            table-layout="fixed"
            :bordered="false"
            hover
            @select-change="selected = $event.map(String)"
          >
            <template #actions="{ row }"
              ><span v-if="row.builtin" class="dictionary-manager__count">{{
                t("wordProof.builtin")
              }}</span
              ><Button
                v-else
                variant="text"
                size="small"
                @click="emit('edit', category, { word: row.word, replacement: row.replacement })"
                >{{ t("wordProof.edit") }}</Button
              ></template
            >
          </PrimaryTable>
        </TableHeightWrapper>
      </div>
      <div class="dictionary-manager__note">
        <Checkbox v-if="category === 'mistakes'" v-model="showBuiltins">{{
          t("wordProof.showBuiltins")
        }}</Checkbox
        ><span>{{ t("wordProof.localShortHint") }}</span>
      </div>
    </section>
  </div>
</template>
<style scoped lang="scss">
.dictionary-manager {
  display: flex;
  min-height: 430px;
  gap: 16px;
  &__nav {
    width: 128px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    border-right: 1px solid var(--td-component-border);
    padding-right: 16px;
    button {
      justify-content: flex-start;
    }
  }
  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  &__header,
  &__toolbar,
  &__transfer,
  &__note {
    display: flex;
    align-items: center;
  }
  &__header {
    min-height: 32px;
    gap: 4px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--td-component-border);
  }
  &__transfer {
    margin-left: auto;
    gap: 8px;
  }
  &__toolbar {
    gap: 4px;
  }
  &__search {
    width: 160px;
    margin-left: auto;
  }
  &__count,
  &__note {
    color: var(--idea-text-secondary);
  }
  &__table {
    height: min(320px, calc(100dvh - 340px));
    min-height: 160px;
  }
  &__note {
    margin-top: auto;
    gap: 12px;
    flex-wrap: wrap;
  }
}
</style>
