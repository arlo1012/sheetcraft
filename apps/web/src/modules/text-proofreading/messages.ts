export type WordProofMessageSchema = {
  wordProof: {
    title: string;
    sensitive: string;
    terms: string;
    people: string;
    personName: string;
    jobTitle: string;
    variant: string;
    standardTerm: string;
    optionalReplacement: string;
    acceptedRuleHint: string;
    mistakesRuleHint: string;
    sensitiveRuleHint: string;
    termsRuleHint: string;
    peopleRuleHint: string;
    import: string;
    export: string;
    exportSelected: string;
    importHint: string;
    importError: string;
    entryCount: string;
    search: string;
    addEntry: string;
    noEntries: string;
    noEntriesFound: string;
    showBuiltins: string;
    localShortHint: string;
    editAccepted: string;
    editMistake: string;
    addSensitive: string;
    editSensitive: string;
    addTerm: string;
    editTerm: string;
    addPerson: string;
    editPerson: string;
    sensitiveEntryHint: string;
    pairEntryHint: string;
    issueKind: string;

    review: string;
    accepted: string;
    acceptWord: string;
    acceptSelected: string;
    mistake: string;
    dictionary: string;
    settings: string;
    close: string;
    hint: string;
    scope: string;
    selection: string;
    sheet: string;
    workbook: string;
    scan: string;
    word: string;
    replacement: string;
    location: string;
    context: string;
    replace: string;
    ignore: string;
    applySelected: string;
    ignoreSelected: string;
    empty: string;
    choose: string;
    skipped: string;
    truncated: string;
    count: string;
    save: string;
    cancel: string;
    remove: string;
    edit: string;
    kind: string;
    correctWord: string;
    incorrectWord: string;
    builtin: string;
    custom: string;
    origin: string;
    enableBuiltin: string;
    localHint: string;
    wordHint: string;
    addRow: string;
    pasteInvalid: string;
    batchHint: string;
    batchPlaceholder: string;
    invalidWord: string;
    storageRead: string;
    storageWrite: string;
    stale: string;
    noScan: string;
  };
};
export const wordProofZhCN: WordProofMessageSchema = {
  wordProof: {
    title: "校对",
    sensitive: "敏感词",
    terms: "术语",
    people: "姓名职务",
    personName: "姓名",
    jobTitle: "职务",
    variant: "待规范写法",
    standardTerm: "标准术语",
    optionalReplacement: "建议改为（选填）",
    acceptedRuleHint: "正词覆盖范围内不再提示问题，用于减少专名误报。",
    mistakesRuleHint: "命中登记的错词后，提示替换为对应建议词。自定义条目优先于内置规则。",
    sensitiveRuleHint: "命中敏感词即提示核查；建议词可留空。加入正词后不再提示。",
    termsRuleHint: "将登记的待规范写法替换为标准术语；仅匹配已登记写法，不推断其他拼写。",
    peopleRuleHint:
      "检查同一单元格中紧邻姓名的已登记职务，支持空格或冒号分隔。仅提示已知职务搭配错误，不推断未知职务、跨句或跨单元格关系。",
    import: "导入",
    export: "导出",
    exportSelected: "导出所选",
    importHint:
      "导入 UTF-8 TXT / TSV，无表头。正词一列，其余两列，以制表符分隔；导入后可编辑再保存。",
    importError:
      "无法导入。请使用 UTF-8 TXT / TSV 无表头文件，正词一列、其他最多两列，最多 5000 行、2 MB。",
    entryCount: "已选 {selected} / {count} 项",
    search: "搜索词条",
    addEntry: "添加",
    noEntries: "暂无内容",
    noEntriesFound: "没有匹配的词条",
    showBuiltins: "显示内置错词（只读）",
    localShortHint: "词库保存在当前浏览器",
    editAccepted: "编辑正词",
    editMistake: "编辑错词",
    addSensitive: "添加敏感词",
    editSensitive: "编辑敏感词",
    addTerm: "添加术语",
    editTerm: "编辑术语",
    addPerson: "添加姓名职务",
    editPerson: "编辑姓名职务",
    sensitiveEntryHint: "可粘贴一至两列；建议词可留空，每项最多 100 字，同名词取最后一行。",
    pairEntryHint: "可直接粘贴两列数据；每项最多 100 字，同名条目取最后一行。",
    issueKind: "问题类型",

    review: "文字校对",
    accepted: "添加正词",
    acceptWord: "加入正词",
    acceptSelected: "将所选加入正词",
    mistake: "添加错词",
    dictionary: "词库管理",
    settings: "设置",
    close: "关闭",
    hint: "按正词、错词、敏感词、术语和姓名职务词库检查可编辑文本，不检查公式结果，不进行语法或语义推断。",
    scope: "校对范围",
    selection: "选中区域",
    sheet: "当前工作表",
    workbook: "整个工作簿",
    scan: "重新校对",
    word: "词语",
    replacement: "建议改为",
    location: "位置",
    context: "原文",
    replace: "更正",
    ignore: "忽略",
    applySelected: "更正所选",
    ignoreSelected: "忽略所选",
    empty: "未发现词库匹配问题。",
    choose: "请选择要处理的校对项。",
    skipped: "已跳过 {count} 个受保护文本单元格。",
    truncated: "仅显示前 2000 项，处理后请重新校对。",
    count: "待处理 {count} 项",
    save: "保存",
    cancel: "取消",
    remove: "删除",
    edit: "编辑",
    kind: "类型",
    correctWord: "正词",
    incorrectWord: "错词",
    builtin: "内置",
    custom: "自定义",
    origin: "来源",
    enableBuiltin: "启用内置常见错词规则",
    localHint:
      "词库与设置保存在当前浏览器，不随工作簿导出。正词会放行其覆盖范围；自定义错词优先于同名内置规则。",
    batchHint: "每行一个正词，每词最多 100 字；自动忽略空行和重复词。",
    batchPlaceholder: "输入或粘贴多个正词，每行一个",
    addRow: "添加一行",
    pasteInvalid: "请从错词列粘贴最多两列数据，最多 5000 行；建议列仅支持单列粘贴。",
    wordHint: "词语和建议词最多 100 个字符；同名词条保存时会替换原条目。",
    invalidWord: "请检查必填内容、100 字限制和词库总量（最多 5000 项）；错词或术语的两列不能相同。",
    storageRead: "本机词库无法读取，当前使用默认词库；保存前请检查词库内容。",
    storageWrite: "词库保存失败，请检查条目或浏览器存储空间。",
    stale: "工作簿已变化，请重新校对后再更正。",
    noScan: "词库或范围已变化，请重新校对。",
  },
};
export const wordProofEnUS: WordProofMessageSchema = {
  wordProof: {
    title: "Proofreading",
    sensitive: "Sensitive words",
    terms: "Terminology",
    people: "Names and titles",
    personName: "Name",
    jobTitle: "Title",
    variant: "Nonstandard form",
    standardTerm: "Standard term",
    optionalReplacement: "Replacement (optional)",
    acceptedRuleHint:
      "Suppresses matches covered by accepted phrases to reduce false positives for proper names.",
    mistakesRuleHint:
      "Matches registered mistakes and suggests their replacements. Custom entries override built-in rules.",
    sensitiveRuleHint:
      "Flags registered sensitive words for review. Replacements are optional. Accepted phrases suppress these matches.",
    termsRuleHint:
      "Normalizes registered variants to standard terms. Unlisted spellings are not inferred.",
    peopleRuleHint:
      "Checks registered titles immediately next to known names in the same cell, separated by spaces or colons. Unknown titles and relationships across sentences or cells are not inferred.",
    import: "Import",
    export: "Export",
    exportSelected: "Export selected",
    importHint:
      "Import UTF-8 TXT / TSV without headers. One column for accepted words; two tab-separated columns for other categories. Review before saving.",
    importError:
      "Cannot import. Use headerless UTF-8 TXT / TSV: one column for accepted words, up to two for others; maximum 5,000 rows and 2 MB.",
    entryCount: "{selected} / {count} selected",
    search: "Search entries",
    addEntry: "Add",
    noEntries: "No entries yet",
    noEntriesFound: "No matching entries",
    showBuiltins: "Show built-in mistakes (read-only)",
    localShortHint: "Saved in this browser",
    editAccepted: "Edit accepted word",
    editMistake: "Edit incorrect word",
    addSensitive: "Add sensitive words",
    editSensitive: "Edit sensitive word",
    addTerm: "Add terminology",
    editTerm: "Edit terminology",
    addPerson: "Add names and titles",
    editPerson: "Edit name and title",
    sensitiveEntryHint:
      "Paste one or two columns. Replacements are optional; 100 characters per field. The last duplicate wins.",
    pairEntryHint: "Paste two columns. Up to 100 characters per field; the last duplicate wins.",
    issueKind: "Issue type",

    review: "Text proofreading",
    accepted: "Add accepted word",
    acceptWord: "Accept word",
    acceptSelected: "Accept selected words",
    mistake: "Add incorrect word",
    dictionary: "Dictionaries",
    settings: "Settings",
    close: "Close",
    hint: "Checks editable text against accepted words, mistakes, sensitive words, terminology, and name-title entries. Excludes formula results; no grammar or semantic inference.",
    scope: "Scope",
    selection: "Selection",
    sheet: "Current sheet",
    workbook: "Workbook",
    scan: "Check again",
    word: "Word",
    replacement: "Suggested replacement",
    location: "Location",
    context: "Original text",
    replace: "Correct",
    ignore: "Ignore",
    applySelected: "Correct selected",
    ignoreSelected: "Ignore selected",
    empty: "No dictionary issues found.",
    choose: "Select proofreading results to process.",
    skipped: "Skipped {count} protected text cells.",
    truncated: "Showing the first 2,000 matches. Check again after processing.",
    count: "{count} matches remaining",
    save: "Save",
    cancel: "Cancel",
    remove: "Delete",
    edit: "Edit",
    kind: "Type",
    correctWord: "Accepted word",
    incorrectWord: "Incorrect word",
    builtin: "Built-in",
    custom: "Custom",
    origin: "Source",
    enableBuiltin: "Enable built-in phrase rules",
    localHint:
      "Dictionaries and settings stay in this browser and are not exported with the workbook. Accepted phrases suppress matches inside them; custom rules override built-in rules.",
    batchHint:
      "One word per line, up to 100 characters each. Blank lines and duplicates are ignored.",
    batchPlaceholder: "Enter or paste accepted words, one per line",
    addRow: "Add row",
    pasteInvalid:
      "Paste up to two columns from the incorrect-word column, or one from the replacement column; maximum 5,000 rows.",
    wordHint:
      "Words and replacements allow up to 100 characters. Saving replaces an existing entry for the same word.",
    invalidWord:
      "Check required fields, the 100-character field limit, and the 5,000-entry dictionary limit. Mistake and terminology columns must differ.",
    storageRead:
      "Unable to read the saved dictionary; defaults are active. Review the dictionary before saving.",
    storageWrite: "Cannot save the dictionary. Check entries and browser storage.",
    stale: "The workbook changed. Check again before correcting.",
    noScan: "Dictionary or scope changed. Check again.",
  },
};
