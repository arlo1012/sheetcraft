# Sheetcraft Git-only handoff, 2026-10-10 UTC

> **发布后更新：08:55 最终 WIP 已完整提交到 GitHub。**
> 旧交接中“GitHub 不含最新 WIP，必须依赖 Library 两包恢复”的说法现已过时。
> 从本仓库即可取得当前开发源码和本目录精选证据，继续开发不需要 Library。
> 当前是 **WIP 保全提交**，不是已完成验收、全仓 CI 通过或可合并 UI 的结论。

## 1. 从这里接手

- 仓库：<https://github.com/drlo1012/sheetcraft>
- 分支：`refactor/native-xlsx-20261009`
- 精确源码检查点：[e32942b1bb2d8660a1fd11d87acd20f376bde864](https://github.com/drlo1012/sheetcraft/commit/e32942b1bb2d8660a1fd11d87acd20f376bde864)
- 保全来源：2026-10-10 08:55:16–08:55:17 UTC 最终恢复工作区。
- 本次提交继承远端 `8a7be9483ceef7e9bcb5e5f38ce4b843214271a7`，保留远端历史和其他文件；没有 force push、PR 或 UI 合并。
- 22 个变更路径包含尚未发布的 A3 放置检查点和最终全部 `8 modified + 2 untracked` 文件。逐文件 Git blob SHA 已与最终恢复字节核对。
- 原本地 HEAD `b06cd293a3f887815a53a2eb23d51cfc445bb389` 与 GitHub 历史不同，不能直接拿本地 SHA 当作远端提交。

`source-checkpoint.json` 记录 22 个路径的源字节哈希、原工作区状态和远端保全证据。
读取仓库 `AGENTS.md`，先查看现有实现和差异，不重新搭平行实现，不执行丢弃旧工作区的 reset/clean。

## 2. 独立恢复与运行

在新目录克隆，保留任何已有工作区：

```sh
git clone --branch refactor/native-xlsx-20261009 --single-branch \
  https://github.com/drlo1012/sheetcraft.git sheetcraft
cd sheetcraft
git merge-base --is-ancestor e32942b1bb2d8660a1fd11d87acd20f376bde864 HEAD
git diff --stat e32942b1bb2d8660a1fd11d87acd20f376bde864 HEAD
python3 docs/handoff/2026-10-10/verify-preservation.py
```

本目录发布时，源码相对 `e32942b1` 无额外功能改动，仅增加交接证据。若未来分支继续开发，以上差异或验证可能不再为空；不要覆盖未来改动。
需要精确重现本次源码时，在克隆旁创建独立 worktree，交接证据仍留在原克隆目录：

```sh
git worktree add --detach ../sheetcraft-source-e329 \
  e32942b1bb2d8660a1fd11d87acd20f376bde864
cd ../sheetcraft-source-e329
bun install --frozen-lockfile
bun run dev
```

包管理器锁定 `bun@1.3.11`；Node 要求 `^20.19.0 || >=22.12.0`。依赖、安装包、浏览器登录态和未保存窗口内存不在 Git 里，需要在新环境重新准备。开发默认端口 7200。
本次只保全源码和资料，没有新装依赖、运行工程测试、重启桌面或进行 GUI 验收。

## 3. 产品方向和当前边界

Sheetcraft 是自有表格编辑器。保留完整工具栏，每项能力应有真实命令、撤销重做、编辑、取消、权限与持久化；按钮可见不能作为功能通过。

- 第一阶段原生 XLSX 与公式兼容性按用户决定有条件收口。Excel 网页版重新上传后浮动图片不可见保留为已知限制，不再阻塞第二阶段。
- 当前第二阶段顺序：表格 → 透视表 → 真正关联的透视图 → 其余插入功能。
- 后续顺序：插入与验收 → 独立可复用 XLSX I/O / 公式核心包与 API → 完整工具栏 → 整轮完成后才合并 UI 分支。
- 目标应用只验收 Excel 网页版与 WPS，停止 LibreOffice 专项。历史 WPS 版本为 Linux `12.1.2.29182.AK.preread.sw`。
- 技术结构：Vue 3、严格 TypeScript、TDesign Vue、Vite、Bun；`apps/web` 组合应用，`packages/core` 管理命令/历史/快照/公式，`packages/sheet-engine` 管理几何与交互，`packages/xlsx-io` 管理原生字节转换。
- 跨模块工作簿变化走 Core 命令；包不能反向依赖 Web；具体 Vue 工具组件显式组合。
- XLSX 是有界交换格式，完整产品数据备份仍需版本化快照。原生 XLSX 仍遗漏全部 `sheet.drawings` / 原生图表；内部图表持久化不是原生 XLSX 支持。

## 4. 最优先的未完成工作

1. 收尾已有透视表关联图表，以及新工作表 A3 创建后的字段面板/上下文工具激活。
2. 在 `apps/web/src/tests/app/SpreadsheetWorkspace/insert-entrypoints.test.ts` 运行并处理 `keeps reentrant %s authoritative during new-sheet confirmation` 两个参数 `close` / `navigation`。冻结时仅格式/lint完成，两个 guard 未运行。
3. 运行最终聚焦/组合 mounted 测试和最终 Web typecheck。此前资源失败的组合尝试不能算通过；独立主路径成功不能替代整文件或组合成功。
4. 支持的桌面恢复后，从真实 WPS 已配置透视表创建最小簇状柱形 PivotChart，实际保存并解析原生 `pivotSource`，补关联身份、刷新、保存重开和导入导出验收。
5. 原生图片与图表应共用工作表 drawing part，ID不冲突。普通图表引用透视结果单元格不能代替关联 PivotChart。
6. 再继续表格计算列自动填充、扩展原生图表/绘图导入、嵌入对象等小范围闭环。未完成本轮前不合并 UI 分支。

桌面故障当时表现为原生控件连接不可用；无证据确认内存、WebRTC 或 WPS 本身是根因。源码保全不代表桌面恢复。
兼容性差异用最小合成工作簿，在 WPS/Excel 真正保存后对 OOXML 做单因素比较，再加聚焦回归并回真实应用复验。

## 5. 测试结论不能跨检查点合并

- 本地 `9aa114b` / 远端 `8a7be948`：记录 Core 2608、XLSX 863、限定 Web 378、Web typecheck 通过；不覆盖后续 A3 与 WIP。
- 本地 `b06cd293`：记录 276 项限定测试，其中 14 项放置场景，隔离 typecheck 和两个原生 XML 样本；原生合计为 520/560。不是当前整应用类型检查或新 GUI 验收。
- 最终 WIP 采样：Table 主路径 1通过/7跳过，Chart 主路径 1通过/7跳过，分别独立运行。早期字段面板诊断和修复初试失败日志均保留。
- 恢复验证：2679 个文件、HEAD、脏状态和二进制 diff 一致，`git fsck` 通过。只证明恢复完整。
- 2026-10-10 09:37 UTC 精确 `e32942b1` 的 GitHub Actions runs、check runs 和 status 条目均为 0；没有全仓 CI 通过证据。
- 历史边界检查有 125 个既有诊断，不能标作已解决。

## 6. 精选证据索引

本目录 56 份精选历史证据（21 个小型 XLSX）加哈希/交接资料，覆盖：

- `evidence/wps-insert-reference-20261010/`：实际 WPS 普通源、结构化表及其生产者说明。原 `native-pivot.xlsx` 与仓库现有 `packages/xlsx-io/src/tests/pivot-tables/fixtures/wps-table-source.xlsx` 完全相同，原 SHA256 为 `6f03fe0846ee7d1e408b185b21fa9e8f2dee68fd2d9d29899168dc9abb83d974`；未重复复制。
- `evidence/pivot-placement-parity-verification-20261010/`：b06 A3放置、原生源解析、限定测试/隔离类型检查、已刷新/未刷新产品样本。
- `evidence/wps-desktop-acceptance-20261010/`：历史表格/透视、验证、图像、保护/计算及几何/样式有界实测；迭代历史失败仍保留。
- `evidence/excel-web-acceptance-20261010/`：历史网页 Excel 打开、修改与关闭重开范围及修复观察。
- `evidence/wps-authored-iteration-20261010/`、`iteration-cache-production-gui-20261010/`、`iteration-cache-production-sample-20261010/`：真实迭代缓存与产品修复。
- `evidence/font-reset-production-gui-20261010/`：用户选择的默认字体色重置语义、真实保存和 OOXML 断言。
- `evidence/excel-native-reupload-control-20261010/`、`excel-native-iteration-control-20261010/`：浮动图上传限制和原生迭代对照。
- `evidence/wip-085516/`：两个独立主路径结果、早期失败诊断、初次修复失败及最终恢复验证。

真实 GUI 结论仍绑定各自原始文件 SHA 和当时源码。README/日志中的“uncommitted”“Stage 1 open”和 A1 描述是历史切片，当前状态以本交接及 `docs/acceptance/app-checkpoint-20261010.md` 为准。
`historical-repository` / `historical-artifacts` / `historical-isolated-placement` 是旧来源标签，不保证这些未选原始路径在当前克隆存在。截图/录像及旧运行时未随本目录发布，文中引用不构成已交付。

## 7. 元数据处理与验证

新发布的 17 个 XLSX 是元数据脱敏副本，去除了有值的作者/最后修改者/公司/经理属性和含义未定的厂商 ICV 属性。其余 4 个保持原字节。既有原生透视表测试 fixture 没有修改。

- `evidence-manifest.json` 保存每个原始/发布文件 SHA256、变换字段名、全部原始/发布 OOXML part SHA256。
- 所有非 `docProps/` parts 均逐字节保留，功能/工作簿 XML 未变化。ZIP CRC已验证。
- 脱敏文件不等于历史 GUI 实测原始字节，也没有为脱敏副本重新做 GUI 验收。
- 文本仅相对化旧本地路径/移除私有 Library 身份；失败、跳过和未验证结论保持原样。
- `SHA256SUMS` 与 `verify-preservation.py` 可在克隆后检查本目录文件和22个源文件。这是字节保全验证，不是应用测试。

## 8. 没有归档的东西

本次 Git 资料足以继续当前开发，并不等于原 54 MB 历史完整备份归档。
原两包的文件名、大小和 SHA256 保留在 `evidence-manifest.json` 供原始完整档案比对，但包本体未上传：

- 大量旧重复源码/bundle/运行时、947个旧生成验收路径和专用脚本没有补传。
- 未上传未审计截图、私人安装包传输链接、账户/登录资料、依赖缓存、WPS安装包、未落盘窗口内存。
- 不单独发布依赖原大基包的 `apply-overlay.py`，避免给出不可独立使用的恢复步骤。

若要完整复刻旧历史和原脏工作区字节，仍需原基包+overlay；若继续当前产品开发，使用上面的精确 Git 源码即可。

## 9. 仓库内继续阅读

`AGENTS.md`、`docs/insert/wps-alignment.md`、`docs/insert/table-backed-pivots.md`、
`docs/acceptance/app-checkpoint-20261010.md`、`docs/acceptance/font-color-default-reset-20261010.md`、
`docs/acceptance/iterative-caches-20261010.md`、`docs/native-xlsx-migration.md`。
根 README 中某些公式范围、图表未实现和快照版本说明较旧，能力判断以当前代码、专门功能文档及有界证据为准。
