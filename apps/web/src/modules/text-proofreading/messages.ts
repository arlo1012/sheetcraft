export type WordProofMessageSchema = {
  wordProof: {
    title: string;
    general: string;
    batch: string;
    accepted: string;
    mistake: string;
    dictionary: string;
    feedback: string;
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
    invalidWord: string;
    storageRead: string;
    storageWrite: string;
    stale: string;
    feedbackHint: string;
    download: string;
    feedbackPlaceholder: string;
    noScan: string;
  };
};
export const wordProofZhCN: WordProofMessageSchema = {
  wordProof: {
    title: "校对",
    general: "通用校对",
    batch: "批量校对",
    accepted: "添加正词",
    mistake: "添加错词",
    dictionary: "词库管理",
    feedback: "问题反馈",
    settings: "设置",
    close: "关闭",
    hint: "基于内置常见错词及自定义词库匹配，不进行语法或语义判断。仅检查可编辑文本，不检查公式结果。",
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
    empty: "未发现匹配的错词。",
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
    wordHint: "词语和建议词最多 100 个字符；同名词条保存时会替换原条目。",
    invalidWord: "请输入有效且不同的词语与建议词（最多 100 个字符）。",
    storageRead: "本机词库无法读取，当前使用默认词库；保存前请检查词库内容。",
    storageWrite: "词库保存失败，请检查条目或浏览器存储空间。",
    stale: "工作簿已变化，请重新校对后再更正。",
    feedbackHint: "可填写误报词语、建议词和复现说明并下载反馈文件；不会自动上传或发送。",
    download: "下载反馈",
    feedbackPlaceholder: "请描述校对问题…",
    noScan: "词库或范围已变化，请重新校对。",
  },
};
export const wordProofEnUS: WordProofMessageSchema = {
  wordProof: {
    title: "Proofreading",
    general: "General proofreading",
    batch: "Batch proofreading",
    accepted: "Add accepted word",
    mistake: "Add incorrect word",
    dictionary: "Dictionaries",
    feedback: "Feedback",
    settings: "Settings",
    close: "Close",
    hint: "Matches built-in phrase rules and your dictionary, without grammar or semantic analysis. Checks editable text, excluding formula results.",
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
    empty: "No matching incorrect words found.",
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
    wordHint:
      "Words and replacements allow up to 100 characters. Saving replaces an existing entry for the same word.",
    invalidWord: "Enter valid, different words and replacements (up to 100 characters).",
    storageRead:
      "Unable to read the saved dictionary; defaults are active. Review the dictionary before saving.",
    storageWrite: "Cannot save the dictionary. Check entries and browser storage.",
    stale: "The workbook changed. Check again before correcting.",
    feedbackHint:
      "Describe the false positive, suggestion, and reproduction steps, then download a report. Nothing is uploaded or sent automatically.",
    download: "Download feedback",
    feedbackPlaceholder: "Describe the proofreading issue…",
    noScan: "Dictionary or scope changed. Check again.",
  },
};
