# 公式编辑交互

单元格内编辑和公式栏共用函数候选、参数提示、光标替换与引用捕获；当前可用函数只有 `SUM`。
函数清单中的 521 项仍是兼容工作清单，不是产品已支持的候选数。

## 实际操作

输入 `=s`，按 Tab 或 Enter 补成 `=SUM(`；点击或拖选同一工作表的单元格，
得到 `=SUM(B1:C2`；直接按 Enter，自动补齐末尾缺少的 `)`，提交到最初编辑的单元格。
候选也可以用鼠标选择；上下键切换候选。候选开启时，Enter/Tab 先接受候选，不提交单元格。

```text
=s -> [SUM] -> Tab -> =SUM( -> drag B1:C2 -> =SUM(B1:C2
                                                   |
                                                   v
                                      Enter -> =SUM(B1:C2) -> one Core edit
```

- 引用选框独立于主选区；拖选不改变编辑目标，不提前写入工作簿。
- 编辑时，每个 A1 引用/范围的公式文字和网格边框使用相同颜色；不同范围按出现顺序分配颜色。
  输入逗号、继续选取、移动光标或通过 F2 编辑已有公式，都保留公式中全部引用的标记。
  同一几何范围的重复引用共用颜色（包括绝对引用变体），超过八种不同范围时循环配色。
- 已插入引用可继续点击另一个单元格或重新拖选来替换；输入逗号或运算符后，可以插入下一处引用。
- 可把光标放进已有 A1 引用中替换，保留公式后面的内容；字符串和普通文本不会进入引用捕获。
- F4 循环 `A1 -> $A$1 -> A$1 -> $A1 -> A1`，范围两端一起切换。
- Enter/Shift+Enter 提交后向下/上移动；Tab/Shift+Tab 提交后向右/左移动。
  提交前仅补齐末尾缺失的右括号，包括嵌套函数；已闭合公式不重复添加。
  只有补齐后通过 Core 语法解析才采用补齐结果，不修补缺失的运算数、逗号后参数或引号。
  失焦和保存仍沿用原草稿提交规则，不额外改写输入。
- Esc 先收起候选，下一次取消编辑；Alt+Enter 仍插入换行。
- 中文输入法组合期间不接受候选、不插入引用，也不会通过保存提前提交未结束的组合文本。
- 拖选复用网格命中测试、冻结窗格几何和边缘自动滚动；提交、取消和失焦会结束当前引用捕获。

## 边界

Web 共享层只处理输入文本与浮层；网格采集同表的单元格/矩形范围，工作簿编辑仍经过 Core 命令和历史。
彩色文字是不可交互、对辅助技术隐藏的文本镜像；原生 textarea 继续负责光标、选择、复制粘贴与输入法。
镜像同步原生输入框的字体、换行和滚动位置；输入法组合期间暂时恢复原生文字显示。
引用识别可处理未完成的公式，但跳过字符串、跨表引用、结构化引用和函数名中的类似 A1 的文本。
公式栏捕获编辑开始时的 Sheet ID 和地址，避免之后的活动位置变化让草稿写到别处。
保存沿用已有的草稿刷新和版本化快照通道，不保存计算缓存或输入辅助状态。

这次不新增函数计算能力，也不支持跨表选引用、整行/整列引用、命名区域或动态数组。
完整语法与 Excel 对照仍属于[后续兼容方案](formula-excel-compatibility-plan.md)。

## 定向验证

```sh
bun run typecheck:web
bun run test:web src/tests/shared/formula-editing src/tests/modules/workbook/components/WorkbookFormulaBar src/tests/modules/sheet-grid/components/SheetGrid src/tests/modules/sheet-grid/composables/useCellEditing.test.ts src/tests/app/SpreadsheetWorkspace
bun run build:web
bun scripts/check-web-bundle.mts
```

高风险焦点、真实键盘和拖选另外进行浏览器验证。入口体积的功能增量与预算依据记录在
[ADR 0004](architecture/0004-performance-and-verification.md)。
