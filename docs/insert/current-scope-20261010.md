# Insert 当前范围清单（2026-10-10）

基线：`9d8fbde5e5615089a396fc694c77153c20edf371`；随后本检查点只修现有
图形/照相机/控件编辑器的拒绝与陈旧会话边界，不增加插入类型。

“已有产品路径”指已找到真实 Web 入口、Core 命令/模型和快照持久化，不等于本轮
逐项 GUI 验收或所有 XLSX 原生变体支持。全清单按实际 `InsertToolbar.vue` 及其
具体子组件列出；本轮没有发现仅占位、完全没有实现的插入按钮。

| 入口/已有能力                    | 产品实现状态                                                                         | 原生 I/O 与当前验收边界                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 表格                             | 真实结构化表、样式、筛选、总计、范围扩展/转换及 Core 历史                            | 已有表结构/样式 I/O；整项本轮未重新双应用 GUI 验收                                                                                              |
| 透视表                           | 创建、字段/聚合/筛选/分组、显式刷新、Show Details 等真实路径                         | 已有有界原生 I/O；本轮关联图表闭环不等于所有布局/筛选变体复验                                                                                   |
| 透视图                           | 已有从报告创建与身份关联；刷新由报告显式命令驱动                                     | 已验证簇状柱关联图的 WPS/Excel 导入导出、源编辑→刷新→保存重开；其他关联图型仍受限                                                               |
| 普通图表                         | Core/Web 已有 12 图型、行/列系列、独立两表头、图例/标签/隐藏/堆叠选项                | column、straight circle-marker line、horizontal clustered bar 的有界原生往返已验证；8 个方向/表头组合均做双应用编辑与重开；其他配置不是自动支持 |
| 四图仪表盘                       | 真实单次 Core 命令创建 column/line/pie/bar 四图                                      | 整个仪表盘本轮未 GUI 往返；pie 原生缺口导致当前整体原生导出不完整                                                                               |
| 图片（单元格/浮动）              | 真实素材与对象路径                                                                   | 已有准备后 raster 原生导出；导入仍 drawing/media 阻断；整项本轮未复验                                                                           |
| 截图                             | 捕获后复用图片路径，非空按钮                                                         | raster 导出沿图片路径；本轮未执行整项截图验收                                                                                                   |
| 形状、图标、文本框、艺术字、公式 | 真实编辑器、对象渲染和 Core 快照；公式用既有呈现路径                                 | 通用对象原生交换尚未实现，导出有定位的 feature-omitted；本检查点修拒绝 draft/陈旧回调，未增加原生图形支持                                       |
| 照相机                           | 活动区域关联、实时渲染与 Core 对象                                                   | 原生交换未实现并明确报告省略；本检查点验证已有编辑器失败/取消/重入/文档变化；不是本轮双应用 GUI 通过项                                          |
| 表单控件                         | checkbox/radio/combo/list/spinner/scrollbar/button/label/group；链接单元格与命令历史 | 原生控件交换未实现并报告省略；本检查点验证已有确认生命周期，不扩控件类型                                                                        |
| 文档/附件                        | 文件素材、文档/图标呈现、查看/下载和 Core 持久化路径                                 | 原生 embedded object/attachment 交换未实现并报告省略；本轮未用用户文件复验                                                                      |
| 迷你图                           | 真实编辑与 Core 路径                                                                 | 已有原生 I/O；整项本轮未复验                                                                                                                    |
| 超链接                           | 真实单元格/内部引用与 Web 打开路径                                                   | 已有原生 I/O；整项本轮未复验                                                                                                                    |
| 符号                             | 写入普通单元格文字                                                                   | 跟随普通文本 I/O，无新 drawing 格式；整项本轮未复验                                                                                             |
| 水印                             | 实际工具栏 slot、页装饰和预设持久化                                                  | XLSX tiled watermark/presets 尚无对应实现，导出明确省略；本轮未复验                                                                             |

## 真实剩余缺口

1. **产品功能缺口**：结构化表计算列公式自动填充明确未实现。依据
   [表格合同](../features/table-styles.md)“Automatic calculated-column formula fill”。
2. **原生图型缺口**：area/pie/doughnut/scatter/radar/treemap/sankey/river/wordCloud
   已有产品图型，但原生 I/O 尚未实现；现有堆叠、更多轴/来源/缓存变体也不能当作
   通过。当前 headerless 1×1 来源无法证明系列方向，继续保守省略。
3. **对象原生交换缺口**：通用 drawing/image 导入；形状/图标/文本框/艺术字/
   公式/照相机/附件/控件/水印的原生交换。已定位的省略警告不等于功能已保留。
4. 图标当前复用九种形状的真实编辑器，不是独立图标目录。目录扩展属于需要另定
   范围的产品行为，不能只因按钮叫“图标”就偷偷改变合同。

## 已闭合、未验与下一小片

- 已闭合的本轮原生图工作见 [column](native-column-charts.md)、
  [line](native-line-charts.md)、[bar](native-bar-charts.md)、
  [PivotChart](native-pivotchart-import.md) 及各自验收记录。样式、几何和原生横条图
  图例视觉顺序差异仍明确警告，不是无损或像素相同。
- 本轮编辑器修复见 [确认生命周期验收](../acceptance/insert-dialog-guards-20261010.md)。
  源码/DOM/Core 回归与 WPS/Excel 文件验收分开记；上述“本轮未复验”不虚构 GUI 结果。
- 当前下一片是已有结构化表的有界真实 UI/双应用验收，见
  [当前检查点](../acceptance/structured-table-lifecycle-20261010.md)。计算列只在 WPS
  观察候选规则，自动覆盖行为尚未定义，不实现；pie/更多图型暂不扩展。
- pie 的首系列原生来源证明仍需单独实测；仪表盘复制完整多系列来源，仅恢复首
  系列不能自动证明未序列化列/行，所以不能预先宣称已补齐仪表盘整体往返。
- I/O/公式独立包与 API 阶段应按这张清单明确支持/省略合同；本次三个普通图型原生
  闭环不能用作“整个 Insert 已完成”的宣布或 UI 合并依据。

## 可追踪源码

- 具体入口：`apps/web/src/modules/insert-tools/components/InsertToolbar.vue`；
  `modules/charts/components/ChartInsertTools.vue`、`modules/pivot-tables/components/PivotInsertTools.vue`。
- 模型/命令：`packages/core/src/{sheet-charts,sheet-drawings,tables,pivot-tables}.ts`。
- 原生图与对象省略：`packages/xlsx-io/src/{column-charts,column-chart-reader,chart-package-parts,pivot-charts,codec,export-finalizer}.ts`。
- 各能力在 `apps/web/src/modules/<feature>` 有具体 owner，回归在对应
  `apps/web/src/tests/modules/<feature>`；跨入口真实命令测试为
  `apps/web/src/tests/app/SpreadsheetWorkspace/insert-entrypoints.test.ts`。
