# Insert 当前范围清单（2026-10-13 更新）

最新优先级：完整桌面WPS对标Symbol及中文/响应布局。Symbol完整信息层级、真实字体
覆盖、子集、特殊字符、近期与自定义管理及字符字体编辑已实现，用户细节验收待完成；
功能与边界见 [符号](symbols.md)。此前“已验”均只指明确列出的有限路径，不代表工具整体完成。
图片本轮主要入口已交用户细节验收；形状已接通标准图库、自由路径、文字与字符格式、
真正组合、连接绑定、详细格式窗格及共同三维场景，准确范围见 [形状](shape-current-scope.md)。
形状阶段的三维绑定路线、完整透视编辑光标和复杂混合连写限制仍明确保留。
现代艺术字正在分阶段补齐，基础对象、25样式、选区字形外观及文档内剪贴板范围见
[艺术字](wordart-current-scope.md)；现有 41 项文字变形、调整柄、直排源编辑及已有对象重套/清除样式的范围与限制同见该文档，不沿用旧代表路径作为整项交付。
队列为 Symbol → 图片 → 形状 → 艺术字 → 文本框 → 公式 → 统计图。
文件I/O、跨应用交换和导出warning开发/验证暂停；原warning WIP保留。

历史代表路径基线：`f6681287b3aaa902252d847f8a6ef7e222668eb7`。已有表格矩阵、有界计算列、
文本框/艺术字、矩形→箭头、Symbol 及内部超链接代表路径已闭合；该历史检查点完成
现有icon/equation代表性生命周期及公式无效控件修复，无新增插入类型或原生格式。

“已有产品路径”指已找到真实 Web 入口、Core 命令/模型和快照持久化，不等于本轮
逐项 GUI 验收或所有 XLSX 原生变体支持。
注意：下表原生定位省略指native API report；当前Web export丢弃warning、仅阻断block，
尚未向用户显示省略位置/数量，此可见性缺口的开发目前暂停。全清单按实际 `InsertToolbar.vue` 及其
具体子组件列出；本轮没有发现仅占位、完全没有实现的插入按钮。

| 入口/已有能力       | 产品实现状态                                                                                                                                                                                                              | 原生 I/O 与当前验收边界                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 表格                | 真实结构化表、样式、筛选、总计、范围扩展/转换及 Core 历史                                                                                                                                                                 | 代表性结构化表 UI/双应用矩阵及有界计算列已验；数字常量总计行 XLSX 导出阻断，更多变体不等于全支持                                                |
| 透视表              | 创建、字段/聚合/筛选/分组、显式刷新、Show Details 等真实路径                                                                                                                                                              | 已有有界原生 I/O；本轮关联图表闭环不等于所有布局/筛选变体复验                                                                                   |
| 透视图              | 已有从报告创建与身份关联；刷新由报告显式命令驱动                                                                                                                                                                          | 已验证簇状柱关联图的 WPS/Excel 导入导出、源编辑→刷新→保存重开；其他关联图型仍受限                                                               |
| 普通图表            | Core/Web 已有 12 图型、行/列系列、独立两表头、图例/标签/隐藏/堆叠选项                                                                                                                                                     | column、straight circle-marker line、horizontal clustered bar 的有界原生往返已验证；8 个方向/表头组合均做双应用编辑与重开；其他配置不是自动支持 |
| 四图仪表盘          | 真实单次 Core 命令创建 column/line/pie/bar 四图                                                                                                                                                                           | 整个仪表盘本轮未 GUI 往返；pie 原生缺口导致当前整体原生导出不完整                                                                               |
| 图片（单元格/浮动） | 框/真实组、四页格式窗格、147项形状裁剪与源操作；见 [当前图片范围](picture-current-scope.md)                                                                                                                               | 本轮主要入口收尾已交用户细节验收；图上吸管、额外高成本源格式和新模型原生交换/打印边界仍明确列出                                                 |
| 截图                | 捕获后复用图片路径，非空按钮                                                                                                                                                                                              | raster 导出沿图片路径；本轮未执行整项截图验收                                                                                                   |
| 图标、公式          | 现有九选图标/LaTeX编辑器、Core快照；公式隐藏实证无效外观与字体开关                                                                                                                                                        | 通用对象原生交换尚未实现，导出有定位的 feature-omitted；本检查点修拒绝 draft/陈旧回调，未增加原生图形支持                                       |
| 形状                | 标准图库/拖画/调整、自由路径与顶点、直接文字/字符格式、三锚定、多选/有序组、绑定路线、详细格式与共享三维；见 [当前形状范围](shape-current-scope.md)                                                                       | 常用阶段准备用户细节验收；活动三维连接关系、完整透视光标和复杂混合连写仍受限；独立文本框主体高级外观另属后续文本框阶段，原生 I/O 未扩展         |
| 文本框、艺术字      | 旧文本对象代表路径保留；现代艺术字的25样式、真实选区填充/轮廓及剪贴板基础见 [艺术字](wordart-current-scope.md)，41项文字变形、独立调整柄、直排源编辑及对象重套/清除已接入；选区完整预设尚待闭合，沿路径复杂脚本有明确限制 | 代表性实际 UI 新增/编辑/取消/撤销重做/移动删除/保存重开已验；原生 XLSX 仍定位省略，不是双应用原生通过                                           |
| 照相机              | 活动区域关联、实时渲染与 Core 对象                                                                                                                                                                                        | 原生交换未实现并明确报告省略；本检查点验证已有编辑器失败/取消/重入/文档变化；不是本轮双应用 GUI 通过项                                          |
| 表单控件            | checkbox/radio/combo/list/spinner/scrollbar/button/label/group；链接单元格与命令历史                                                                                                                                      | 原生控件交换未实现并报告省略；本检查点验证已有确认生命周期，不扩控件类型                                                                        |
| 文档/附件           | 文件素材、文档/图标呈现、查看/下载和 Core 持久化路径                                                                                                                                                                      | 原生 embedded object/attachment 交换未实现并报告省略；本轮未用用户文件复验                                                                      |
| 迷你图              | 真实编辑与 Core 路径；合法 no-op 与拒绝分开，实例/范围picker/owner guard 已验                                                                                                                                             | 同表 line A1:C2→D1:D2 创建/编辑/纠错/取消/清除/UndoRedo/save-reload-JSON 已验；已有 native 本轮未双应用复验                                     |
| 超链接              | 真实单元格/内部引用与 Web 打开路径；拒绝保留草稿和实例/上下文 guard 已修                                                                                                                                                  | 内部链接 create/edit/Cancel/Escape/remove/UndoRedo/save-reload-JSON 已验；已有 native I/O 本轮未双应用复验                                      |
| 符号                | 桌面式三页、真实字体覆盖/子集、代码与字符信息、近期与自定义管理；字符串值与字符字体区间                                                                                                                                   | 当前完整实现待用户细节验收，见 [符号](symbols.md)；历史基础路径仅在原范围有效，XLSX字符字体交换未实现且I/O工作暂停                              |
| 水印                | 实际工具栏 slot、页装饰和预设持久化                                                                                                                                                                                       | XLSX tiled watermark/presets 尚无对应实现，导出明确省略；本轮未复验                                                                             |

## 支持边界与真实剩余缺口

1. **计算列已闭合的有界范围**：全空列首次手工公式自动填充、例外保留、显式整列应用、
   新行继承、粘贴仅目标及历史/快照/有界原生 metadata；详见
   [计算列 GUI 验收](../acceptance/calculated-column-gui-20261011.md)。更广模板族不是自动支持。
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
- 表格矩阵见 [整项矩阵](../acceptance/structured-table-matrix-20261010.md)，
  计算列最终合同/验收见上链接。原候选观察不再代表未实施状态。
- 现有文本框/艺术字的本轮闭合与重置后重新核验见
  [文本对象验收](../acceptance/text-drawings-20261011.md)。图标/公式现有代表路径见
  [icon/equation验收](../acceptance/icon-equation-20261011.md)，创建/edit/取消/history/保存reload
  已验；原生API定位省略不等于GUI警告已显示或双应用原生保真。
- 形状的矩形→箭头代表路径见 [形状生命周期](../acceptance/shape-lifecycle-20261011.md)。
  同一对象实际拖动/右边缩放及完整快照 UndoRedo 已验；不代表所有preset/缩放/保护变体。
  pie/更多图型及通用原生 drawing 仍未扩展。
- 历史基础符号路径的有界闭合见 [Symbol 验收](../acceptance/symbol-20261011.md)。
  陈旧 insert/close 回调在取消/重开后的缺陷已实证修复；符号本身只生成普通编辑草稿，
  后续按原有单元格解析/提交，不是新对象或原生格式。
- 现有超链接的有界闭合见 [Hyperlink 验收](../acceptance/hyperlink-20261011.md)。
  实际 Core 拒绝保留字段/快照/历史，陈旧 confirm/remove/cancel 及上下文失效回归通过；
  GUI 只走合成内部引用，不代表外链/保护/公式/native 全变体验收。
- 现有同表 line 迷你图闭合见 [Sparkline 验收](../acceptance/sparkline-20261011.md)。
  Core 合法无变化 false 仍关闭，实际拒绝变更保留字段；range picker 替换及旧回调
  已实证修复。普通受保护锁定目标原本被预检阻断；不虚称 GUI 保护竞态漏洞。
- 符号和图片的当前实现已交用户细节验收；形状常用阶段收口后，按艺术字、文本框、公式、统计图
  的优先队列补齐桌面能力与体验，用户反馈优先。文件I/O与导出warning工作暂停；其余表单控件、
  camera、截图、文档附件、水印和仪表盘保留后续缺口，不因代表性路径而宣称完整。
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
