# 公式与 Excel 兼容边界方案

状态：Draft / 待确认。整理日期：2026-09-05。

本文是产品范围、模块边界与验收方案，不是已实现能力清单，也不代表已经选定或引入第三方库。
本文最初仅定义方案；后续实现进度独立记录在[公式基础阶段](formula-foundation.md)，不把目标范围当成已实现能力。

## 1. 目标与决策状态

已经明确的目标：

- 公式按完整子系统规划，覆盖函数、语法、引用、计算、编辑和持久化，不以少数示例函数作为最终交付。
- 为后续闭源商用保留选择空间；没有授权预算确认前，不默认购买商业引擎。
- Excel 文件读写与公式计算分开建设，并保持现有 Core、Sheet Engine、Web 边界。

本文建议采用的原则：

- 自己掌握文档模型、计算语义、接口和兼容性测试；通用函数算法优先复用经过验证的实现。
- 函数库和文件读写库都通过适配层接入；不以第三方 Workbook 对象替换 Core 的文档模型。
- 以明确版本的 Excel 对照样本验收，不承诺未经验证的“100% Excel 兼容”。
- 默认严格处理可能丢失的信息；允许有损转换时，必须先报告具体影响并由用户选择。

仍需后续确认的是兼容基准版本、性能预算、复杂文件保真要求和最终依赖选型。
这些待决项不应成为跳过函数类别或把占位功能标为已完成的理由。

## 2. 当前基线

当前已实现单 Sheet 的 A1 引用、范围、绝对/混合引用、四则运算和 SUM，以及复制、移动、行列变更时的引用更新。
文件能力是版本化 JSON 快照和本地 IndexedDB 保存，不是 XLSX 导入导出。
参见 [README](../README.md)、[本地保存与恢复](workbook-persistence.md)。

当前模型已有稀疏单元格、基础样式、尺寸、冻结、筛选和合并；数字格式只有数值、百分比和货币。
日期系统和错误/空字符串模型已进入[基础阶段](formula-foundation.md)；自定义数字格式、命名区域、结构化表、条件格式等仍需要对应的文档模型。
依据：[Workbook](../packages/core/src/workbook.ts)、[Style](../packages/core/src/style.ts)、[Snapshot](../packages/core/src/serialization.ts)。

因此，不能把“文件库能够读出某个字段”直接等同于“idea10 能保存、编辑并重新导出该字段”。

## 3. 模块所有权

沿用 [运行时边界](architecture/0001-workspace-runtime-boundaries.md) 和 [状态与历史](architecture/0003-state-and-history.md)。
下图中的 Excel IO 是建议中的模块，当前不存在，不要求现在创建空包。

```text
apps/web -------> core
apps/web -------> sheet-engine -------> core
apps/web -------> excel-io (proposed) -> core

core/formula
  +-- parser / references / values / recalc
  +-- FunctionProvider
        +-- Formula.js adapter (candidate)
        +-- project-owned implementations
```

- **Core**：唯一的 Workbook、命令、历史和版本化快照所有者；也定义公式值、错误、引用及计算契约。
- **FormulaRuntime**：派生的解析结果、依赖图、计算值和溢出区域，可从文档重建；不接管历史或直接修改单元格 Map。
- **FunctionProvider**：适配已解析的参数、引用和错误；库特有对象不跨越此边界。涉及工作簿上下文的函数由运行时提供能力。
- **Excel IO**：字节与 Core 导入草稿/快照之间的转换，输出兼容报告。若抽为包，只能依赖 Core，不能依赖 Web。
- **Sheet Engine / Web**：分别负责几何与交互契约、编辑器与提示界面；文件选择、下载、存储、Worker 调度等运行时能力留在适配层。

公式引擎自身也应保留替换接口。“掌握核心”不要求解析器、数值算法等所有内部依赖都从零手写。
若未来采用外置引擎实现，使用依赖注入，不建立 Core 与实现包的循环依赖。

### 3.1 不可破坏的约束

1. 文档编辑先由 Core 原子提交，再使公式运行时失效或重算；过期的异步计算结果不能覆盖新版本。
2. 引用改写只能有一个责任方。当前 Core 已处理复制、移动和行列变更，不能再让第三方引擎重复偏移。
3. 保留公式源文本用于编辑、历史与快照；AST 的规范化不能无条件改写用户原文。
4. 存储的是文档状态，不是第三方运行时实例、依赖图或当前计算缓存。
5. 文件解析失败、取消、超限或文档版本已变化时，不能部分替换当前文档。
6. 复用依赖必须有固定版本、许可记录、第三方声明和回归测试；不得由用户公式执行 JavaScript。

## 4. 完整公式范围

### 4.1 清单与函数类别

以 [Microsoft 函数分类目录](https://support.microsoft.com/en-us/excel/excel-functions-by-category) 为盘点入口，记录目录日期与目标 Excel 版本。
完整盘点必须逐函数记录，不能只取 Formula.js 已导出的函数集合。
下面是类别边界及代表性例子，不是逐函数兼容认证，也不是缩减后的交付清单。

```text
Family                 Representative examples
---------------------  ----------------------------------------------
Math / trigonometry    SUM, SUMIFS, ROUND, SUBTOTAL, AGGREGATE
Statistics             COUNTIFS, AVERAGEIFS, MEDIAN, STDEV.S, VAR.P
Logic                  IF, IFS, SWITCH, IFERROR, IFNA, AND, OR
Text / conversion      TEXT, VALUE, TEXTJOIN, TEXTSPLIT, TEXTBEFORE
Date / time            DATE, TIME, DATEDIF, WORKDAY, NETWORKDAYS
Lookup / reference     XLOOKUP, XMATCH, INDEX, MATCH, OFFSET, INDIRECT
Financial              PV, FV, PMT, NPV, IRR, XNPV, XIRR
Engineering            CONVERT, COMPLEX, BESSELJ, BITAND
Information            ISBLANK, ISERROR, CELL, FORMULATEXT
Database               DSUM, DCOUNT, DAVERAGE, DGET
Dynamic arrays         FILTER, SORT, SORTBY, UNIQUE, SEQUENCE
Array transforms       TAKE, DROP, HSTACK, VSTACK, CHOOSECOLS
Local bindings         LET, LAMBDA, MAP, REDUCE, SCAN, BYROW
Compatibility aliases  Documented legacy function names
External / platform    CUBE*, RTD, STOCKHISTORY, add-in functions
```

本地计算类别全部纳入目标清单，包括工程、财务、数据库、兼容别名和现代数组函数。
依赖外部服务、插件或平台的项目也要登记，但必须与本地计算区分，不能用固定值伪装实现。
是否需要外部能力按实际执行行为判断，不能仅凭类别名称判断；例如纯文本 URL 编码、对传入文本的解析不等于联网。
外部能力未获批准前，对相应构造只进行可验证的保留或明确阻止/报告，不承诺本地计算。

每个函数记录以下信息：

- 稳定标识、类别、参数与省略参数规则、返回类型、适用版本、官方依据。
- 执行方式：普通值、引用、惰性分支、易变、动态依赖、数组或外部能力。
- 提供方及固定版本、兼容差异、测试向量与交互样本。
- 分别记录解析、计算、编辑提示、导入导出状态，而不是一个笼统的 supported 布尔值。
- 实现状态使用 planned / verified / differs / unavailable；只有通过规定的测试才能改为 verified。

中英文搜索、说明、参数提示和错误反馈必须国际化。函数注册表可以描述领域元数据，不能用它生成通用 Ribbon 组件树。

### 4.2 语法、引用与名称

- 数字、文本、布尔、错误字面量，空参数，嵌套调用，比较、连接、幂、百分号及优先级。
- A1、绝对/混合引用、整行整列、范围、联合/交集引用、带空格或引号的 Sheet 名。
- 跨 Sheet 与 3D 引用，工作簿级/Sheet 级名称、名称遮蔽、命名公式和结构化表引用。
- 数组常量、动态数组、溢出引用 `#`、隐式交集 `@`、LET 作用域、LAMBDA 参数和递归限制。
- R1C1、共享公式、传统数组公式、模拟运算表公式等导入构造必须分别登记，不得默默当成普通 A1 文本。
- 外部工作簿引用保留结构和来源；没有显式提供的数据源时，报告不可计算，不自行访问文件或网络。

输入本地化与存储/交换语法分离：保留源文本，内部使用稳定标识；XLSX 适配器处理前导等号、函数标识、分隔符及格式专用前缀。
变更大小写、空白、名称或引用时，必须明确是用户编辑、结构命令改写还是必要的格式转换。

### 4.3 值、日期、错误与计算语义

- 区分真正空白、空字符串、零、布尔、文本数字和省略参数；区分值数组与带位置/元数据的引用。
- 日期采用可明确转换的 Excel 序列值与工作簿日期系统，不能把宿主 JS Date 解析当成兼容规则。
  覆盖 1900/1904 系统、序列边界、时间小数、时长和固定的时区/输入解释策略。
- 数值精度、舍入、条件匹配、通配符转义、大小写、文本与 Unicode 行为均需要边界样本。
- 支持错误值作为单元格数据与计算结果；内部解析/循环/资源错误和 Excel 错误必须显式映射，不能混为字符串。
- IF 等条件分支的求值方式逐项验证；不能把 IF、IFS、AND、OR 一概按 JavaScript 短路规则处理。
- NOW、TODAY、随机函数等采用可注入的时钟/随机源与明确的重算批次，不能随每次界面渲染改变。
- SUBTOTAL / AGGREGATE 需要筛选、手动隐藏、嵌套小计等上下文；不能只传入丢失行信息的二维值数组。
- 自动/手动重算、循环诊断、可选迭代计算和不收敛处理都必须有明确策略；未支持时不得显示伪造的有效结果。

日期与筛选语义应依据具体规则和样本核验，参见 [Excel 日期系统](https://support.microsoft.com/en-us/excel/date-systems-in-excel) 和 [SUBTOTAL](https://support.microsoft.com/en-us/excel/subtotal-function)。

### 4.4 数组、增量计算与编辑一致性

- 依赖图覆盖单元格、范围、名称、结构化表、溢出范围和动态引用；变更动态目标时清理旧依赖。
- 一次编辑只使受影响的依赖失效；整列引用不能强迫稀疏工作簿分配整列或整张表。
- 数组函数的数值输出与溢出占位分开管理；碰到已有内容、合并区域、表区域或边界时，按对应规则诊断，不能覆盖数据。
- 复制、剪切、填充、排序、插删行列、Sheet 重命名/删除、名称/表结构变化必须走同一引用更新契约。
- 撤销/重做恢复源文本和文档结构，计算值与溢出区域重新得到一致结果。
- 计算、筛选可见性和显示之间要定义依赖顺序；发现依赖循环时诊断，不能让筛选和重算无限互相触发。
- 自动补全、参数提示、引用高亮、溢出区域提示与错误定位属于完整交付范围。

动态数组的阻挡和编辑行为应单独验证，参见 [Microsoft 溢出行为说明](https://support.microsoft.com/en-us/excel/dynamic-array-formulas-and-spilled-array-behavior)。

## 5. Excel 文件与产品能力

### 5.1 格式范围

- 主线交换格式：XLSX。CSV/TSV 作为有明确编码、分隔符和类型解释规则的数据交换格式，不能承诺样式或多 Sheet 保真。
- 旧 XLS、XLSB、ODS 等登记为可扩展格式，是否进入首个版本由实际文件需求决定，不默认同时引入多套库。
- XLSM、VBA、外部连接、嵌入对象、Power Query、数据模型等属于单独的产品与授权决策；不会自动执行。
- 加密文件、异常压缩包、XML 异常和资源超限必须明确拒绝或报告，不以“尽量打开”为由绕过校验。

### 5.2 能力方向必须分开

每个特性分别维护 read / render / edit / recalc / write / roundtrip 六个方向。
状态含义如下；计划中的特性不是当前支持状态。

```text
State     Meaning
--------  ------------------------------------------------------------
planned   Target only; not shipped
verified  Tested for the declared direction and compatibility profile
limited   Explicit differences or restrictions, with test evidence
preserve  Retained only; not editable or necessarily recalculable
blocked   Operation refused with a structured reason
n/a       Direction does not apply
```

目标按依赖分组，不按是否能被某个库直接读取来删减：

```text
Group  Target scope
-----  ---------------------------------------------------------------
X1     Scalars, formulas, formats, dimensions, merge, freeze, filter
X2     Names, tables, validation, conditional formats, comments, links
X3     Images, charts, pivots, print/page setup, protection
EXT    Macros, external data, queries, embedded active content
```

- **X1** 是首个端到端往返验收门，不是完整路线的终点；包括日期、错误值、自定义数字格式和公式结果来源。
- **X2** 的名称与结构化表和公式引擎一起推进；验证规则、条件格式要有持久化规则、范围更新、计算和界面，不能仅保存显示结果。
- **X3** 是后续完整产品能力，需要独立对象模型和编辑/刷新逻辑。写出图表、透视表或打印参数不等于有可用的产品功能。
- **EXT** 默认只检测与报告。支持读取、原样保留、刷新、执行是不同承诺，需要逐项批准。

保护、隐藏和密码相关能力必须区分“可编辑性提示”与真正的加密/权限，不能混同。

### 5.3 先补齐可承载的文档模型

- 工作簿设置：日期系统、计算配置、名称作用域，以及需要持久化的兼容配置版本。
- 单元格：类型、公式源与公式种类、错误值、富文本，以及值与显示格式的分离。
- 样式：原始/解析后的数字格式、字体、填充、边框、对齐、主题色、继承及保护相关属性。
- Sheet：手动隐藏与筛选隐藏的区别、尺寸默认值与覆盖、分组、结构化表、范围规则、打印参数。
- 对象：批注、链接、图像、图表、透视对象等按自己的领域模型扩展，不塞进不透明的通用 cell.value。
- 扩展数据：若承诺只保留的部件，要有版本化持久化和失效规则，不能只暂存在 Web 内存。

新增模型必须同时考虑命令、引用更新、历史、序列化迁移和校验。JSON 仍是原生文档格式，XLSX 是交换适配，不反向决定 Core 的对象形状。

### 5.4 公式缓存不是计算真值

XLSX 可能携带公式文本和以前保存的结果，读取结果并不意味着当前引擎会计算该公式。
[ExcelJS](https://github.com/exceljs/exceljs#formula-value) 和 [SheetJS CE](https://docs.sheetjs.com/docs/csf/features/formulae/) 都明确区分公式保存与结果计算。

结果来源需区分 calculated / imported-cache / unavailable：

- 导入缓存只可作为带来源标记的预览，不能声称已重新计算或仍然有效。
- 任一可能影响缓存的文档编辑、配置变化或外部数据变化都要使相应缓存失效；无法确定依赖时保守失效。
- 运行时计算缓存不进入原生快照。若产品需要刷新后保留外部缓存预览，必须定义独立的、版本化的交换元数据及失效规则。
- 导出结果只能使用对应同一文档版本的有效计算结果；不能继续写出已失效的缓存。
- 未知函数或不支持的语法仍保留源公式并给出诊断，不能自动转换成常量。

## 6. 导入、导出和信息损失

### 6.1 导入事务

```text
bytes
  -> format / resource checks
  -> isolated import draft + compatibility report
  -> Core validation
  -> user confirmation + document revision check
  -> replace document once
  -> rebuild runtime / save versioned native snapshot
```

解析期间不修改打开的文档。替换使用现有文件导入的确认与历史重置规则；“导入到当前 Sheet”若以后需要，应另设可撤销命令，不能混用。
取消、失败、过期任务和不支持的格式必须保留原文档及其历史。默认导出新文件，不自动覆盖原始 Excel 文件。

### 6.2 严格与有损策略

严格模式为建议默认值：如果无法满足所声明方向的保真要求，则阻止该操作并给出原因。
可选的有损导入/导出必须在执行前列出影响，由用户明确选择，且不能绕过损坏文件和资源限制。

兼容报告至少包含：严重程度、特性、Sheet/地址或文件部件、影响方向、原因、处理方式、可否恢复/重算。
例如，忽略条件格式规则、缺少有效公式结果、图表无法随源数据更新，都不能只显示一句“部分格式可能不同”。

“只保留原始部件”必须有可验证的适用条件。Sheet 改名/删除、行列结构变化、样式重编号或相关源数据变化可能使部件失效。
没有可靠更新策略时，严格导出应阻止；不得把旧图表、旧透视缓存或失效引用重新附回去后声称无损。

不承诺字节级相同。验收的是明确列出的语义、格式和元数据一致性，以及所有未保留信息都被正确报告。

## 7. 第三方选型条件

以下是候选定位，不是已批准的依赖清单。授权说明以接入时的固定版本及其传递依赖为准。

```text
Candidate        License               Intended role
---------------  --------------------  --------------------------------
Formula.js       MIT                   Function implementations
ExcelJS          MIT                   XLSX read/write adapter
SheetJS CE       Apache-2.0            Broader format adapter if needed
HyperFormula     GPLv3 or commercial    Engine alternative after review
```

- Formula.js 的 4.6.1 版本于 2026-07-28 发布，包含 SUMIFS 修复；可以作为验证起点，不能凭 Star 或函数数量直接定选。
  [提交记录](https://github.com/formulajs/formulajs/commits/master)、[许可](https://github.com/formulajs/formulajs/blob/master/LICENSE)。
- 其 [函数表](https://formulajs.info/functions/) 标注的统计日期是 2025-05-13，不能作为当前版本的完整覆盖证明；日期等规则仍需适配。
  [函数使用与差异](https://github.com/formulajs/formulajs#differences-between-excel-functions-and-formulajs)。
  迁移说明、网站函数表和实际发布包也需要区分；包括 TEXT、VALUE 在内的目标函数都要核对固定包的实际导出与语义，不能推定存在。
- Formula.js 的日期返回模式是模块级可变状态；适配器必须通过固定配置、边界转换或隔离，避免不同工作簿/并发任务互相改变日期模式。
  工作簿的 1900/1904 设置不能依赖一个全局切换开关。参见 [日期模式实现](https://github.com/formulajs/formulajs/blob/master/src/utils/date.js)。
- ExcelJS 先验证实际 XLSX 样本、浏览器/Worker 适用性、包体和资源消耗；不能把仓库主分支功能直接当成发布包能力。
  [文档](https://github.com/exceljs/exceljs)、[许可](https://github.com/exceljs/exceljs/blob/master/LICENSE)。
- SheetJS CE 只在格式需求足以证明必要时纳入；CE 与 Pro 的授权及能力不能混用。
  [格式清单](https://docs.sheetjs.com/docs/miscellany/formats/)、[CE 授权](https://docs.sheetjs.com/docs/miscellany/license/)。
- HyperFormula 不作为未经确认的默认依赖。GPL 允许商用，但闭源集成与分发要核对义务；如评估商业版，需要确认授权范围和成本。
  [官方授权](https://hyperformula.handsontable.com/docs/guide/licensing.html)。

准入门槛：

1. 固定发布版本、来源、许可证与传递依赖，准备第三方声明；不能仅检查顶层包的 MIT 标签。
2. 通过函数直接调用测试及接入后的引用、日期、错误、数组测试，避免“单函数通过、组合公式错误”。
3. 通过复制/结构修改/撤销和原生快照重建测试，不破坏精确的公式源文本。
4. 通过 Excel 往返样本、资源限制、取消和损失报告测试；记录 Node、浏览器和 Worker 的适用范围。
5. 比较升级、修复、替换和商业交付的长期成本；不以免费许可证等同于零维护成本。

如果候选不能满足门槛，先记录失败证据，再选择修补、替换或讨论商业引擎；不能静默缩减已约定范围。

## 8. 验收与测试资产

测试树继续镜像源码所有权。Core 和运行时使用 Node 测试；Web 编辑器、文件交互和浏览器资源行为在 Web 测试层验证。

### 8.1 函数与工作簿对照

需要建立可追溯的 Excel 样本库，记录 Excel 产品/平台/构建号、区域、日期系统、计算模式及强制重算过程。
缓存值只有在确认由目标版本重新计算后才可作为基准；WPS/LibreOffice 可以补充差分验证，不能默认替代 Excel 真值。
当前尚未建立这套完整基准，本文不声称已通过兼容验收。

```text
ID   Required scenario
---  --------------------------------------------------------------
F01  Literals, omitted args, precedence, text/number/boolean coercion
F02  Per-function evaluation order, errors, criteria and wildcards
F03  Mixed refs, quoted Sheet names, names, 3D and table references
F04  Serial dates 1/59/60/61, 1900/1904, time fractions and formats
F05  SUBTOTAL 9/109, filters, manual hiding and nested subtotals
F06  Spill growth/shrink, collisions, #/@, LET and LAMBDA scopes
F07  Dynamic dependency changes, volatile epochs and circular refs
F08  Copy/move/fill/sort/axis/Sheet changes plus undo and redo
F09  Native snapshot reload, exact source text and runtime rebuild
F10  Each inventoried local function and documented compatibility gap
```

F02 包含 `IF(FALSE,1/0,42)`，并分别验证 IFS、SWITCH、CHOOSE、IFERROR、IFNA 及 AND/OR 的求值顺序和错误行为；不能从一个 IF 用例推出全部函数的短路策略。
F05 必须区分两类隐藏：筛选排除的行与用户手动隐藏的行；不能把目前已有的筛选可见性直接当成完整 Excel 隐藏模型。
F10 覆盖每个纳入范围的函数；F01-F09 是跨函数规则和组合行为，不能互相替代。

### 8.2 文件往返与资源约束

```text
ID   Required scenario
---  --------------------------------------------------------------
X01  XLSX import -> edit -> undo/redo -> export -> Excel reopen
X02  Values, formulas, fresh results, formats and metadata comparison
X03  Cached/unsupported formulas and missing external dependencies
X04  Strict/lossy decisions, precise reports and original-file safety
X05  Preserved-part invalidation after structural and source edits
X06  Malformed/encrypted/oversized files, cancellation and stale jobs
X07  No macro execution or implicit network/file/connection access
X08  Native save/reload retains all promised imported information
```

首批性能样本至少包含：高行号稀疏数据、整列引用、长依赖链、多 Sheet、10 万非空单元格与 1 万公式的组合。
记录冷启动/增量重算/导入导出耗时、峰值内存、产物体积和主线程阻塞；测试环境与阈值在选型验证后固定。
不允许为通过测试而提高现有包体或资源预算而不说明理由。

同时用可观测计数检查依赖访问和重算数量，避免只以一次机器上的耗时证明增量计算正确。
统计空白的函数也要覆盖稀疏范围，不能照搬 SUM 的“只遍历非空值”策略。

## 9. 实施顺序与完成条件

下列阶段是依赖顺序，不是把完整要求拆成可随时停止的小范围交付。

```text
G0: profile + inventory + reference corpus
  -> G1: model / value / reference / history contracts
  -> G2: engine and XLSX adapter qualification
  -> G3: complete local formula scope + X1 roundtrip + editor UX
  -> G4: X2 / X3 product capabilities and interaction regression

EXT: separate scope, service, security and licensing decisions
```

- **G0**：确认本方案的目标边界，建立逐函数/逐特性登记表和对照文件；没有测试资产不能作兼容结论。
- **G1**：确定日期/错误/格式/名称/数组模型、唯一引用改写责任方和快照迁移，先验证现有编辑与恢复行为不退化。
- **G2**：用同一组样本验证函数供应商、运行时方案和 XLSX 库，给出选型结论与失败项，不只做安装成功的演示。
  此阶段验证的是选型可行性，不代表完整 X1 往返、公式结果保真或 XLSX 产品功能已经交付。
- **G3**：本地公式范围按登记表验收，完成编辑体验和 X1 往返；X2 中被公式依赖的名称/表模型必须已具备。
- **G4**：按能力模块完成数据验证、条件格式、对象、分析与打印等；不能把“原样保留”算作“可编辑”。

单个阶段可以独立提交和验证，但只完成 G2 或少量函数不能宣称“完整公式子系统完成”。
每次版本说明需列出 verified、limited、preserve 和 blocked 的变化，并附回归证据。

## 10. 下一步建议

优先完成 G0/G1 的设计细化与代表性适配验证，再批准依赖接入。
需要定下的事项是：

1. 作为主基准的 Excel 产品、平台、版本，以及可用于对照的样本文件。
2. 首次商业交付必须支持的 Excel 特性和文件格式；复杂对象是可编辑目标还是只保留目标。
3. 严格模式为默认、有损转换需确认的产品策略。
4. 性能/包体/文件大小预算，以及是否允许评估付费引擎或 SDK。

在这些决策明确前，可以推进函数与特性盘点、模型草案和隔离验证，不应把某个候选库写死为产品核心。
