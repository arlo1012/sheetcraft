# Positive ordinary-line automatic axis diagnosis — 2026-10-20

Base: `f055089d42ec9e99399686b260596795e033798b`. This is a diagnostic checkpoint,
not a rendering fix. Production code, workbook schema and native axis XML are unchanged.

## Actual WPS matrix

WPS Sheets 12.1.2.29182, signed out, cloud desktop. Each synthetic workbook was
opened in the real app. The source is the previously verified actual Web export
`evidence/native-marker-size-20261020/web-marker-size9.xlsx`; the generator changes
worksheet values and matching chart caches, chart title, drawing dimensions, and
(for one control) marker visibility. All remain ordinary primary, nonstacked lines.
The chart is positioned at A6 for inspection. These are synthetic input fixtures,
not a claim that WPS authored their initial bytes.

Apple baseline values are 60, 100, 120; pear values are 70, 80, 90. Min / max / major
below are observed axis labels, not stored explicit settings.

| Case | Native size (px) | WPS min / max / major |
| --- | --- | --- |
| base120 | 640 × 400 | 0 / 140 / 20 |
| max119 (last apple = 119) | 640 × 400 | 0 / 140 / 20 |
| max121 (last apple = 121) | 640 × 400 | 0 / 140 / 20 |
| scale01 (all values × 0.1) | 640 × 400 | 0 / 14 / 2 |
| scale10 (all values × 10) | 640 × 400 | 0 / 1400 / 200 |
| narrow (apple 118,119,120; pear 118.5,119.2,119.5) | 640 × 400 | 117 / 120.5 / 0.5 |
| small | 320 × 200 | 0 / 150 / 50 |
| short | 640 × 200 | 0 / 150 / 50 |
| tall | 640 × 600 | 0 / 140 / 20 |
| large | 960 × 600 | 0 / 140 / 20 |
| nomarkers (both series none) | 640 × 400 | 0 / 140 / 20 |

The same width at heights 200, 400 and 600 isolates a height dependency in these
samples. Width changes at a fixed tested height did not change these axes. Tall
and large charts were also viewed at 70% worksheet zoom to show the complete chart;
zoom was restored to 100% afterward. This does not establish the exact WPS layout
algorithm, a universal width independence, or thresholds between tested heights.

Actual WPS Save As copies of base120, narrow and short are included. Save completed
without an observed repair dialog. The post-save baseline and short chart remained
visibly unchanged. These three copies and all eleven inputs import one native chart;
all fourteen chart XML parts still omit value-axis min, max and majorUnit. Thus this
is not an importer losing explicit OOXML bounds, and adding fixed OOXML values would
mask rather than solve the renderer difference.

## Current product rendering

The evidence script imports current TypeScript source, decodes each XLSX, calls
getSheetChartData → createChartOption, and renders actual ECharts 6.1.0 SVG at the
native drawing size. It checks tick labels actually present in the SVG, not only
option objects. These are SSR results, not a new browser GUI or print acceptance.

- Eleven of fourteen inputs/savebacks render SVG. Among the original matrix rows,
  only max121 agrees with the observed WPS labels.
- Baseline, max119, tall, large and nomarkers render 0–120 by 20; scaled rows render
  0–12 by 2 and 0–1200 by 200. Narrow also renders 0–120 by 20.
- small, short and short-wps-saved fail before ECharts rendering with RangeError:
  “Axis titles leave less than a 96×96px plot; enlarge the chart or reduce title size.”
  No titles were stripped and no successful native-size SVG is fabricated.
- The base120 and narrow savebacks preserve the corresponding current-renderer
  mismatch. No source bounds/units were invented by the saveback.

## Why no heuristic was implemented

ECharts automatic value axes include zero, use default splitNumber 5, and select a
nice interval before rounding endpoints outward. Changing splitNumber alone to
integers 1–20 was tested on diagnostic option copies. It cannot produce the baseline
0–140 by 20: a 120 maximum and a 20 interval round to 120. It also cannot remove zero
from the narrow-positive range. Only max121 matches at splitNumber 5–8.

Relevant installed source is echarts/lib/coord/axisNiceTicks.js, scaleRawExtentInfo.js
and util/number.js. The application currently leaves automatic domain controls unset.
WPS's zero-inclusion threshold, headroom rule, interval selection and exact layout
breakpoints are still unknown. The matrix proves layout dependence, so no 120→140
special case, arbitrary padding constant or renderer-only guessed formula is added.

A future axis investigation should first vary available plot height across the
observed 200/400 boundary while independently controlling title/font margins, then
measure the narrow-positive zero-inclusion transition. Keep explicit min/max/units,
negative/mixed-sign, secondary, log, stacked, combo and other chart types outside any
unverified adaptation. A shared hook, if later justified, belongs after
applyChartCommonFormat in createChartOption, which is also used by print; persist no
calculated automatic bounds in chart.format or OOXML.

## Next bounded user-visible issue

Fix valid small native charts failing to render solely because axis-title layout
reserves more than their height. The direct reproductions are auto-axis-small.xlsx,
auto-axis-short.xlsx and auto-axis-short-wps-saved.xlsx. WPS displays all three;
current createChartOption calls reserveChartAxisTitles, which throws at
apps/web/src/modules/charts/chart-axis-title-layout.ts:148–152. This is independent
of matching WPS automatic ticks and should preserve full title content and explicit
axis settings rather than remove titles or clamp the workbook geometry.

Square-marker admission is a separate limit, not the next task here. Source audit
and an in-memory probe confirm square is currently rejected with a chart omission,
not silently rendered as a circle. No WPS square-marker acceptance is claimed.

## Reproduction and evidence

`evidence/native-auto-axis-20261020/` contains fourteen XLSX files, their SHA-256
manifest, generator, matrix inputs, concise observations and audit-current-svg.ts.
From the repository root with dependencies installed:

    bun docs/acceptance/evidence/native-auto-axis-20261020/audit-current-svg.ts

It writes diagnostic JSON and SVGs alongside the script. It modifies no workbook or
product source. The generation script rebuilds the synthetic inputs, not the real
WPS Save As outputs. Byte hashes certify the committed samples, not a promise that
ZIP timestamps are deterministic. Screenshots, credentials, application profiles,
dependencies and installers are intentionally not included.

No full test-suite, CI-green, Excel Online or print-parity claim is made. This
checkpoint records a verified discrepancy and a separate render failure, not a fix.
