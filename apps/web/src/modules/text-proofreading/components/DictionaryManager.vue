<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Tooltip } from "tdesign-vue-next/es/tooltip";
import { PrimaryTable } from "tdesign-vue-next/es/table";
import type { PrimaryTableCol } from "tdesign-vue-next/es/table/type";
import { Search, Plus, Trash2, Pencil, Info, Upload, Download } from "lucide-vue-next";
import { vIconAction } from "../../../shared/focus/icon-action";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
import {
  builtinRules,
  type DictionaryCategory,
  type WordDictionary,
  type WordRule,
} from "../proofreading";
import {
  isSingleWordCategory,
  dictionaryEntries,
  dictionaryTemplateEntries,
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
        ? "wordProof.terms"
        : category.value === "sensitive"
          ? "wordProof.sensitive"
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
  ...(isSingleWordCategory(category.value)
    ? []
    : [{ colKey: "replacement", title: secondLabel.value, ellipsis: true }]),
  { colKey: "actions", title: t("proofreading.action"), width: 72, align: "center" },
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
function downloadTemplate() {
  downloadDictionaryText(
    dictionaryTemplateEntries(category.value),
    category.value,
    `${title.value}-${t("wordProof.importTemplate")}`,
  );
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
      <button
        type="button"
        :aria-current="category === 'accepted' ? 'page' : undefined"
        @click="category = 'accepted'"
      >
        {{ t("wordProof.correctWord") }}
      </button>
      <button
        type="button"
        :aria-current="category === 'mistakes' ? 'page' : undefined"
        @click="category = 'mistakes'"
      >
        {{ t("wordProof.incorrectWord") }}
      </button>
      <button
        type="button"
        :aria-current="category === 'sensitive' ? 'page' : undefined"
        @click="category = 'sensitive'"
      >
        {{ t("wordProof.sensitive") }}
      </button>
      <button
        type="button"
        :aria-current="category === 'terms' ? 'page' : undefined"
        @click="category = 'terms'"
      >
        {{ t("wordProof.terms") }}
      </button>
      <button
        type="button"
        :aria-current="category === 'people' ? 'page' : undefined"
        @click="category = 'people'"
      >
        {{ t("wordProof.people") }}
      </button>
    </nav>
    <section class="dictionary-manager__content" :aria-label="title">
      <div class="dictionary-manager__header">
        <strong>{{ title }}</strong>
        <Tooltip :content="hint"
          ><span class="dictionary-manager__info" tabindex="0" :aria-label="hint"
            ><Info class="idea-action-icon" aria-hidden="true" /></span
        ></Tooltip>
        <div class="dictionary-manager__transfer">
          <Tooltip :content="t('wordProof.templateHint')">
            <Button theme="default" variant="text" @click="downloadTemplate">{{
              t("wordProof.downloadTemplate")
            }}</Button>
          </Tooltip>
          <Tooltip :content="t('wordProof.importHint')"
            ><Button
              theme="default"
              variant="outline"
              :loading="reading"
              @click="fileInput?.click()"
              ><template #icon><Upload :size="14" /></template>{{ t("wordProof.import") }}</Button
            ></Tooltip
          >
          <Button
            theme="default"
            variant="outline"
            :disabled="!entries.length"
            @click="exportEntries"
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
        <Button variant="outline" theme="default" @click="emit('add', category)"
          ><template #icon><Plus :size="14" /></template>{{ t("wordProof.addEntry") }}</Button
        >
        <Button
          variant="outline"
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
            <template #actions="{ row }">
              <span v-if="row.builtin" class="dictionary-manager__count">{{
                t("wordProof.builtin")
              }}</span>
              <div v-else class="dictionary-manager__row-actions" @dblclick.stop>
                <span
                  v-icon-action
                  :aria-label="t('wordProof.edit')"
                  :title="t('wordProof.edit')"
                  @click.stop="
                    emit('edit', category, { word: row.word, replacement: row.replacement })
                  "
                  ><Pencil class="idea-action-icon" aria-hidden="true"
                /></span>
                <span
                  v-icon-action
                  :aria-label="t('wordProof.remove')"
                  :title="t('wordProof.remove')"
                  @click.stop="emit('remove', category, [row.word])"
                  ><Trash2 class="idea-action-icon" aria-hidden="true"
                /></span>
              </div>
            </template>
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
@use "../../../shared/option-list/option-list";
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
      @include option-list.item;
      min-height: 28px;
      &[aria-current="page"]:not(:focus-visible) {
        background: var(--idea-surface-active);
      }
    }
  }
  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  &__header,
  &__toolbar,
  &__transfer,
  &__note {
    display: flex;
    align-items: center;
  }
  &__header {
    min-height: 28px;
    gap: 4px;
    padding-bottom: 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--td-component-border);
  }
  &__info {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  &__row-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--idea-space-2);
    > span {
      width: 24px;
      height: 28px;
    }
  }
  &__transfer {
    margin-left: auto;
    gap: 8px;
  }
  &__toolbar {
    gap: 8px;
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
