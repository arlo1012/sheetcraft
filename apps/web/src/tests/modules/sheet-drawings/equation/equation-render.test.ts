// @vitest-environment node
import { expect, test } from "vitest";
import {
  renderEquationSource,
  EQUATION_RENDER_LIMITS,
} from "../../../../modules/sheet-drawings/equation/equation-render";
test("public KaTeX source handles normal structures and reports parse failure safely", () => {
  expect(
    renderEquationSource("\\frac{\\sqrt{x}}{y}+\\begin{matrix}1&2\\\\3&4\\end{matrix}").status,
  ).toBe("ready");
  const result = renderEquationSource("\\badcommand{<script>}");
  expect(result.status).toBe("invalid");
});
test("input nesting and token budgets stop before unbounded rendering", () => {
  expect(renderEquationSource("x".repeat(EQUATION_RENDER_LIMITS.sourceUnits + 1)).status).toBe(
    "budget",
  );
  expect(renderEquationSource("{".repeat(33) + "x" + "}".repeat(33)).status).toBe("budget");
  expect(renderEquationSource("x ".repeat(4097)).status).toBe("budget");
});
test("untrusted commands cannot produce external links/images/HTML", () => {
  for (const source of [
    "\\href{https://example.com}{x}",
    "\\includegraphics{https://example.com/a.png}",
    "\\htmlClass{evil}{x}",
  ]) {
    const result = renderEquationSource(source);
    if (result.status === "ready") {
      expect(result.html).not.toMatch(/<a\b|<img\b|class="evil"/);
    }
  }
});
