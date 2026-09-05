# 公式与 Excel：基础阶段

日期：2026-09-05。对应[整体兼容方案](formula-excel-compatibility-plan.md)的范围清单、Core 基础模型和候选库隔离试验。
这不是全部公式或 XLSX 功能完成的声明；产品计算能力仍是单 Sheet A1、四则运算和 SUM。

## 本阶段交付

- [函数清单](compatibility/function-inventory.json)：Microsoft 目录快照中 521 个去重函数，逐项保留分类、来源、执行范围和六方向状态。目录刷新不覆盖人工审核的状态。
- [特性清单](compatibility/feature-inventory.json)：41 项公式与 Excel 特性；函数数量不能代替语法、引用、重算和文件保真的验收。
- Core：错误值、空白与空字符串区分；工作簿日期系统；共享 A1 解析与带 Sheet ID 的引用契约；可撤销日期设置；V3 快照及 V1/V2 迁移。
- [隔离试验](../tools/compatibility-lab/README.md)：固定 Formula.js 4.6.1、ExcelJS 4.4.0，验证代表调用、合成文件往返、包依赖与构建可行性。它们没有进入产品依赖。

清单的 `verified` 需要明确的 Excel 基准与对照样本。本阶段不把合成样本或库自身行为升级为 Excel 兼容结论，也不缩减整体函数范围。

## 值与输入契约

| Meaning            | Core representation           | Input text  |
| ------------------ | ----------------------------- | ----------- |
| Blank              | no content / null             | empty input |
| Empty text         | literal with value ""         | '           |
| Error              | error with typed FormulaError | #N/A        |
| Error-looking text | literal with value "#N/A"     | '#N/A       |
| Formula            | formula with exact source     | =SUM(A1:A2) |

`setCellContent` 可以保存显式空字符串；原有 `setCellValue("")` 和清空编辑器仍然清空内容，避免更改原有清空行为。
`getCellComputedValue` 返回标量或错误；旧的标量接口 `getCellValue` 对错误仍返回 `null`，新公式适配器不得用它读取错误。

错误码和显示 token 在 Core 集中定义，包括 `#NAME?`、`#N/A`、`#DIV/0!` 以及数组计算会用到的 `#SPILL!`、`#CALC!`。
能够表示错误不等于已经实现对应函数或动态数组。`#PARSE!`、`#CYCLE!` 是产品诊断，不宣称是 Excel 的同名显示语义。
输入错误 token 或 `=错误token` 均可表达错误；前者是错误常量，后者仍保存为公式原文。前置单引号明确表示文本。

普通富文本单元格复制保留错误类型；当前 TSV 和“仅粘贴值”的通道仍将计算错误投影为显示文本，尚未升级为 Excel 的类型化跨应用剪贴板。
公式原文、错误内容、显式空字符串都经过命令、批量写入、移动、行列变更和撤销/重做路径，而不是绕过历史直接改 Map。

## 日期系统

每个 Workbook 独立保存 `dateSystem: "1900" | "1904"`，默认 `1900`。
`createSetWorkbookDateSystemCommand` 只改变序列值的解释，不自动给所有数字加减 1462，也不重写公式；使用正常的撤销/重做历史。
暂未添加日期设置 UI 或日期数字格式。

日期转换使用无时区的年月日时分秒毫秒结构，不依赖宿主 `Date`、时区或第三方模块的全局模式。

| System | Serial | Civil parts policy                       |
| ------ | ------ | ---------------------------------------- |
| 1900   | 0      | 1900-01-00                               |
| 1900   | 59     | 1900-02-28                               |
| 1900   | 60     | 1900-02-29 (explicit synthetic leap day) |
| 1900   | 61     | 1900-03-01                               |
| 1904   | 0      | 1904-01-01                               |

本阶段支持非负序列至 9999-12-31，时间小数按最近毫秒取整；无效日期、越界、非有限数字明确报错。
负日期、超界格式显示、各函数的溢出日期与类型转换规则仍要按兼容样本分别实现，不能直接套用此严格转换器冒充 DATE 等函数。

## 引用与序列化

本地公式解析器复用 `parseA1FormulaReference`，复制和结构变更沿用现有引用重写和原文恢复路径。
独立 `parseFormulaReference` 能把一个 A1 单元格/矩形引用和可选 Sheet 名称解析成稳定的 `sheetId + range`；名称解析由调用者提供。
原始拼写、绝对/相对标志、偏移与目标身份分开保存。格式化使用当前 Sheet 名称映射产生规范的限定引用，原始 `source.text` 不被覆盖。

这是后续解析器与文件适配器的共同契约，不是跨表计算支持。外部工作簿、3D、结构化引用会明确拒绝，命名区域和动态引用留在清单中。

```text
V1 / V2 snapshot --validate + default 1900--> Workbook
V3 / V4 snapshot --validate explicit system--> Workbook
Workbook ----------serialize raw state-----> V4 snapshot
Workbook ----------derive------------------> formula results (not persisted)
```

V3 起接受新的错误常量和显式空字符串；V1/V2 仍按历史规则校验，不借旧版本声明混入新值类型。
Web 保存接口使用当前 `WorkbookSnapshot` 类型；旧版本类型仅用于迁移。独立 Sheet 快照仍由内容字段区分旧值格式和当前格式，支持复制 Sheet 与历史恢复。
图片功能在此基础上使用 V4 保存图片引用与浮动位置；V3 仍作为公式基础的迁移输入。旧构建不能读取 V4 文件，升级时应保留原备份；不生成有损降级文件。

## 验证与后续边界

```sh
bun run check:compatibility
bun run test:core -- src/tests/formula src/tests/serialization src/tests/history src/tests/commands/workbook-settings
bun run test:web -- src/tests/app/SpreadsheetWorkspace/formula-foundation.test.ts
cd tools/compatibility-lab
bun install --frozen-lockfile
bun run qualify
```

Core 测试运行在 Node；Web 集成测试检查加载、显示、保存、富内容粘贴及无效导入不替换文档。
产品 CI 检查类型、测试、边界、公共包导入、Worker 消费、体积，以及不联网的清单校验。候选库试验单独运行，不把它们捆入产品首屏。

下一步是实现完整公式运行时的语法与求值契约、依赖图和函数适配，再按照清单建立逐函数 Excel 对照证据。
XLSX 产品适配仍需自定义数字格式等模型、类型映射、导入原子性、资源限制与有损报告；目前只有合成文件试验，不提供产品导入导出入口。
真实 Excel 样本、基准版本、性能预算和复杂文件保真要求仍是后续资格门槛，不因本阶段测试通过而自动满足。
