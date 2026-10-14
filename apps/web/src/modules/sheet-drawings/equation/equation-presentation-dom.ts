import {
  equationCanvasFont,
  equationFontUse,
  type EquationFontUse,
} from "./equation-presentation-fonts";
import {
  EquationPresentationFailure,
  type EquationDrawOperation,
  type EquationPresentationLimits,
  type EquationRect,
} from "./equation-presentation-plan";

const SVG_NS = "http://www.w3.org/2000/svg";
const invisibleStrut = /^[\u200b]*$/u;
const noEffect = (value: string, defaults: readonly string[]) => !value || defaults.includes(value);

function unsupported(message: string): never {
  throw new EquationPresentationFailure("unsupported-primitive", message);
}

function assertCoordinateEffects(style: CSSStyleDeclaration): void {
  if (
    !noEffect(style.transform, ["none"]) ||
    !noEffect(style.rotate, ["none"]) ||
    !noEffect(style.scale, ["none"]) ||
    !noEffect(style.translate, ["none"]) ||
    !noEffect(style.zoom, ["1", "normal"]) ||
    !noEffect(style.perspective, ["none"])
  )
    unsupported("An equation coordinate transform is unsupported.");
}

/** The offscreen shell must keep the authoring consumer's centered, clipped box.
 * Ancestor transforms are not represented by unrotated canvas glyph operations. */
export function assertEquationPresentationEnvironment(host: HTMLElement, view: Window): void {
  const style = view.getComputedStyle(host);
  assertCoordinateEffects(style);
  const expected = {
    display: "flex",
    position: "fixed",
    alignItems: "center",
    justifyContent: "center",
    left: "-100000px",
    top: "0px",
    pointerEvents: "none",
    flexDirection: "row",
    flexWrap: "nowrap",
    boxSizing: "content-box",
    overflowX: "hidden",
    overflowY: "hidden",
    paddingTop: "0px",
    paddingRight: "0px",
    paddingBottom: "0px",
    paddingLeft: "0px",
    marginTop: "0px",
    marginRight: "0px",
    marginBottom: "0px",
    marginLeft: "0px",
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    fontStyle: "normal",
    lineHeight: "normal",
    direction: "ltr",
    writingMode: "horizontal-tb",
    visibility: "visible",
    opacity: "1",
    borderRadius: "0px",
  } as const;
  for (const [key, value] of Object.entries(expected)) {
    if (style[key as keyof typeof expected] !== value)
      unsupported("The equation presentation shell layout was altered by host styling.");
  }
  if (
    !noEffect(style.fontWeight, ["normal", "400"]) ||
    !noEffect(style.rowGap, ["normal", "0px"]) ||
    !noEffect(style.columnGap, ["normal", "0px"]) ||
    !noEffect(style.backgroundColor, ["transparent", "rgba(0, 0, 0, 0)"]) ||
    !noEffect(style.backgroundImage, ["none"]) ||
    !noEffect(style.boxShadow, ["none"]) ||
    !noEffect(style.outlineStyle, ["none"])
  )
    unsupported("An equation presentation shell paint effect is unsupported.");
  for (let element: Element | null = host; element; element = element.parentElement) {
    const effective = view.getComputedStyle(element);
    assertCoordinateEffects(effective);
    if (
      !noEffect(effective.filter, ["none"]) ||
      !noEffect(effective.backdropFilter, ["none"]) ||
      !noEffect(effective.maskImage, ["none"]) ||
      !noEffect(effective.clipPath, ["none"]) ||
      !noEffect(effective.clip, ["auto"]) ||
      !noEffect(effective.opacity, ["1"]) ||
      !noEffect(effective.visibility, ["visible"]) ||
      !noEffect(effective.mixBlendMode, ["normal"])
    )
      unsupported("An equation ancestor paint effect is unsupported.");
  }
}

export function equationDOMNodeCount(root: Element, maximum: number): number {
  const walker = root.ownerDocument.createTreeWalker(root, 0xffffffff);
  let count = 1;
  while (walker.nextNode()) {
    if (++count > maximum)
      throw new EquationPresentationFailure(
        "budget",
        "Equation DOM exceeds the presentation budget.",
      );
  }
  return count;
}

/** Only the HTML presentation subtree is traversed. MathML remains untouched and unpainted. */
export function equationDOMFontUses(root: Element, view: Window): readonly EquationFontUse[] {
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const uses: EquationFontUse[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent ?? "";
    if (invisibleStrut.test(text)) continue;
    const parent = walker.currentNode.parentElement;
    if (!parent || parent.namespaceURI === SVG_NS)
      unsupported("SVG text is not a supported KaTeX primitive.");
    uses.push(equationFontUse(view.getComputedStyle(parent), text));
  }
  return uses;
}

export function captureEquationDisplayList(
  root: HTMLElement,
  host: HTMLElement,
  view: Window,
  limits: EquationPresentationLimits,
  checkpoint: () => void,
): { readonly operations: readonly EquationDrawOperation[]; readonly bytes: number } {
  const origin = host.getBoundingClientRect();
  const operations: EquationDrawOperation[] = [];
  let bytes = 0;
  const finite = (...values: number[]) => {
    if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > limits.coordinate))
      throw new EquationPresentationFailure(
        "budget",
        "Equation layout has an invalid or excessive coordinate.",
      );
  };
  const rect = (value: DOMRect): EquationRect => {
    const result = {
      x: value.left - origin.left,
      y: value.top - origin.top,
      w: value.width,
      h: value.height,
    };
    finite(result.x, result.y, result.w, result.h);
    if (result.w < 0 || result.h < 0) unsupported("Negative equation layout dimensions.");
    return Object.freeze(result);
  };
  const clipsFor = (element: Element): readonly EquationRect[] => {
    const clips: EquationRect[] = [];
    for (
      let current: Element | null = element;
      current && current !== host;
      current = current.parentElement
    ) {
      const style = view.getComputedStyle(current);
      const x = style.overflowX || style.overflow;
      const y = style.overflowY || style.overflow;
      const clippedX = x === "hidden" || x === "clip";
      const clippedY = y === "hidden" || y === "clip";
      if (clippedX !== clippedY) unsupported("One-axis equation clipping is unsupported.");
      if (clippedX) {
        if (style.borderRadius && style.borderRadius !== "0px")
          unsupported("Rounded equation clipping is unsupported.");
        if (
          [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ].some((width) => Number.parseFloat(width) > 0) ||
          !noEffect(style.overflowClipMargin, ["0px"])
        )
          unsupported("An equation clip border or margin is unsupported.");
        clips.push(rect(current.getBoundingClientRect()));
      }
    }
    return Object.freeze(clips);
  };
  const append = (operation: EquationDrawOperation) => {
    checkpoint();
    if (operations.length >= limits.drawOps)
      throw new EquationPresentationFailure(
        "budget",
        "Equation draw operations exceed the presentation budget.",
      );
    bytes += JSON.stringify(operation).length * 2 + 96;
    if (bytes > limits.displayListBytes)
      throw new EquationPresentationFailure(
        "budget",
        "Equation display list exceeds the presentation budget.",
      );
    operations.push(Object.freeze(operation));
  };
  const assertStyle = (element: Element, style: CSSStyleDeclaration) => {
    assertCoordinateEffects(style);
    if (
      !noEffect(style.transform, ["none"]) ||
      !noEffect(style.filter, ["none"]) ||
      !noEffect(style.boxShadow, ["none"]) ||
      !noEffect(style.textShadow, ["none"]) ||
      !noEffect(style.clipPath, ["none"]) ||
      !noEffect(style.clip, ["auto"]) ||
      !noEffect(style.maskImage, ["none"]) ||
      !noEffect(style.backdropFilter, ["none"]) ||
      !noEffect(style.opacity, ["1"]) ||
      !noEffect(style.mixBlendMode, ["normal"]) ||
      !noEffect(style.visibility, ["visible"]) ||
      !noEffect(style.backgroundImage, ["none"]) ||
      !noEffect(style.outlineStyle, ["none"]) ||
      !noEffect(style.zIndex, ["auto"]) ||
      !noEffect(style.borderRadius, ["0px"])
    )
      unsupported("An equation CSS paint effect is unsupported.");
    if (style.display === "none")
      unsupported("Hidden equation presentation content is unsupported.");
    for (const pseudo of ["::before", "::after"]) {
      const pseudoStyle = view.getComputedStyle(element, pseudo);
      const content = pseudoStyle.content;
      if (!noEffect(content, ["none", "normal", '""', "''"]))
        unsupported("Generated equation text is unsupported.");
      if (content === '""' || content === "''") {
        assertCoordinateEffects(pseudoStyle);
        if (
          !noEffect(pseudoStyle.backgroundColor, ["transparent", "rgba(0, 0, 0, 0)"]) ||
          !noEffect(pseudoStyle.backgroundImage, ["none"]) ||
          !noEffect(pseudoStyle.boxShadow, ["none"]) ||
          !noEffect(pseudoStyle.maskImage, ["none"]) ||
          !noEffect(pseudoStyle.filter, ["none"]) ||
          !noEffect(pseudoStyle.outlineStyle, ["none"]) ||
          !noEffect(pseudoStyle.display, ["inline", "none"]) ||
          !noEffect(pseudoStyle.position, ["static"]) ||
          !noEffect(pseudoStyle.width, ["auto"]) ||
          !noEffect(pseudoStyle.height, ["auto"]) ||
          [
            pseudoStyle.borderTopWidth,
            pseudoStyle.borderRightWidth,
            pseudoStyle.borderBottomWidth,
            pseudoStyle.borderLeftWidth,
            pseudoStyle.paddingTop,
            pseudoStyle.paddingRight,
            pseudoStyle.paddingBottom,
            pseudoStyle.paddingLeft,
            pseudoStyle.marginTop,
            pseudoStyle.marginRight,
            pseudoStyle.marginBottom,
            pseudoStyle.marginLeft,
          ].some(
            (value) => Number.parseFloat(value) !== 0 && Number.isFinite(Number.parseFloat(value)),
          )
        )
          unsupported("An empty equation pseudo-element paint or layout primitive is unsupported.");
      }
    }
  };
  const assertRange = (range: Range): DOMRect => {
    if (range.getClientRects().length !== 1)
      unsupported("Multi-line equation text is unsupported.");
    const value = range.getBoundingClientRect();
    rect(value);
    if (value.width <= 0 || value.height <= 0)
      unsupported("The browser did not provide a laid-out equation text run.");
    return value;
  };
  const sameRect = (a: DOMRect, b: DOMRect) =>
    [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height].every(
      (delta) => Math.abs(delta) <= 0.01,
    );
  const paintText = (node: Text) => {
    const text = node.data;
    if (invisibleStrut.test(text)) return;
    const parent = node.parentElement;
    if (!parent || parent.namespaceURI === SVG_NS) unsupported("SVG text is unsupported.");
    const style = view.getComputedStyle(parent);
    if (
      !noEffect(style.letterSpacing, ["normal", "0px"]) ||
      !noEffect(style.wordSpacing, ["normal", "0px"]) ||
      !noEffect(style.textTransform, ["none"]) ||
      !noEffect(style.textDecorationLine, ["none"]) ||
      !noEffect(style.fontVariant, ["normal"]) ||
      !noEffect(style.fontFeatureSettings, ["normal"]) ||
      !noEffect(style.fontVariationSettings, ["normal"]) ||
      !noEffect(style.fontKerning, ["auto"]) ||
      !noEffect(style.fontStretch, ["normal", "100%"]) ||
      !noEffect(style.direction, ["ltr"]) ||
      !noEffect(style.writingMode, ["horizontal-tb"])
    )
      unsupported("An equation text shaping property is unsupported.");
    const use = equationFontUse(style, text);
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const before = assertRange(range);
    const parentBefore = parent.getBoundingClientRect();
    const rootBefore = root.getBoundingClientRect();
    // A zero-size inline-block's top is its actual alphabetic baseline. Never infer it
    // from font-size or glyph bounds. Reject if the probe changes source layout.
    const probe = node.ownerDocument.createElement("span");
    probe.style.cssText =
      "display:inline-block!important;width:0!important;height:0!important;padding:0!important;margin:0!important;border:0!important;vertical-align:baseline!important;line-height:0!important;position:static!important;";
    try {
      parent.insertBefore(probe, node.nextSibling);
      const baseline = probe.getBoundingClientRect().top - origin.top;
      const after = assertRange(range);
      if (
        !sameRect(before, after) ||
        !sameRect(parentBefore, parent.getBoundingClientRect()) ||
        !sameRect(rootBefore, root.getBoundingClientRect())
      )
        unsupported("The equation baseline probe changed layout.");
      finite(baseline);
      append({
        kind: "text",
        text,
        x: before.left - origin.left,
        baseline,
        font: equationCanvasFont(use),
        color: style.color,
        clips: clipsFor(parent),
      });
    } finally {
      probe.remove();
      range.detach();
    }
  };
  const paintBox = (element: HTMLElement, style: CSSStyleDeclaration) => {
    const bounds = rect(element.getBoundingClientRect());
    const clips = clipsFor(element.parentElement ?? host);
    if (
      style.backgroundColor &&
      !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor)
    ) {
      if (bounds.w > 0 && bounds.h > 0)
        append({ kind: "rect", ...bounds, color: style.backgroundColor, clips });
    }
    const sides = ["Top", "Right", "Bottom", "Left"] as const;
    const widths = sides.map((side) => Number.parseFloat(style[`border${side}Width`]) || 0);
    finite(...widths);
    for (const [index, side] of sides.entries()) {
      const width = widths[index]!;
      if (width <= 0 || style[`border${side}Style`] === "none") continue;
      if (
        style[`border${side}Style`] !== "solid" ||
        (style.borderRadius && style.borderRadius !== "0px")
      )
        unsupported("An equation border primitive is unsupported.");
      const stripe =
        side === "Top"
          ? { x: bounds.x, y: bounds.y, w: bounds.w, h: width }
          : side === "Bottom"
            ? { x: bounds.x, y: bounds.y + bounds.h - width, w: bounds.w, h: width }
            : side === "Left"
              ? {
                  x: bounds.x,
                  y: bounds.y + widths[0]!,
                  w: width,
                  h: Math.max(0, bounds.h - widths[0]! - widths[2]!),
                }
              : {
                  x: bounds.x + bounds.w - width,
                  y: bounds.y + widths[0]!,
                  w: width,
                  h: Math.max(0, bounds.h - widths[0]! - widths[2]!),
                };
      finite(stripe.x, stripe.y, stripe.w, stripe.h);
      if (stripe.w > 0 && stripe.h > 0)
        append({ kind: "rect", ...stripe, color: style[`border${side}Color`], clips });
    }
  };
  const paintSVG = (svg: SVGSVGElement) => {
    const rootStyle = view.getComputedStyle(svg);
    if (
      !noEffect(rootStyle.backgroundColor, ["transparent", "rgba(0, 0, 0, 0)"]) ||
      [
        rootStyle.borderTopWidth,
        rootStyle.borderRightWidth,
        rootStyle.borderBottomWidth,
        rootStyle.borderLeftWidth,
        rootStyle.paddingTop,
        rootStyle.paddingRight,
        rootStyle.paddingBottom,
        rootStyle.paddingLeft,
      ].some((value) => Number.parseFloat(value) > 0)
    )
      unsupported("An equation SVG box paint primitive is unsupported.");
    const box = rect(svg.getBoundingClientRect());
    const viewBox = (svg.getAttribute("viewBox") ?? "")
      .trim()
      .split(/[\s,]+/u)
      .map(Number);
    if (
      viewBox.length !== 4 ||
      viewBox.some((value) => !Number.isFinite(value)) ||
      viewBox[2]! <= 0 ||
      viewBox[3]! <= 0
    )
      unsupported("An equation SVG viewBox is unsupported.");
    finite(...viewBox);
    const clips = Object.freeze([...clipsFor(svg.parentElement ?? host), box]);
    for (const element of svg.querySelectorAll("*")) {
      checkpoint();
      if (element.localName !== "path" || element.children.length)
        unsupported("An equation SVG primitive is unsupported.");
      const path = element as SVGPathElement;
      const style = view.getComputedStyle(path);
      assertStyle(path, style);
      if (
        !noEffect(style.stroke, ["none"]) ||
        !noEffect(style.fillOpacity, ["1"]) ||
        !noEffect(style.strokeOpacity, ["1"])
      )
        unsupported("An equation SVG stroke or opacity is unsupported.");
      if (style.fill === "none") continue;
      const fill =
        style.fill === "currentcolor" || style.fill === "currentColor" ? style.color : style.fill;
      if (!fill || /^(?:url\s*\(|context-fill|context-stroke|var\s*\(|env\s*\()/iu.test(fill))
        unsupported("An equation SVG paint server is unsupported.");
      const d = path.getAttribute("d") ?? "";
      if (!d.trim()) unsupported("An equation SVG path is empty.");
      if (d.length * 2 > limits.displayListBytes)
        throw new EquationPresentationFailure("budget", "An equation SVG path is excessive.");
      for (const token of d.match(/[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?/giu) ?? [])
        finite(Number(token));
      const matrix = typeof path.getScreenCTM === "function" ? path.getScreenCTM() : null;
      if (!matrix) unsupported("The browser did not provide a laid-out equation SVG transform.");
      const values = Object.freeze([
        matrix.a,
        matrix.b,
        matrix.c,
        matrix.d,
        matrix.e - origin.left,
        matrix.f - origin.top,
      ] as const);
      finite(...values);
      if (Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12)
        unsupported("An equation SVG transform is singular.");
      const fillRule = style.fillRule || "nonzero";
      if (fillRule !== "nonzero" && fillRule !== "evenodd")
        unsupported("An equation SVG fill rule is unsupported.");
      append({
        kind: "path",
        d,
        matrix: values,
        color: fill,
        fillRule,
        clips,
      });
    }
  };
  const visit = (element: Element) => {
    checkpoint();
    const style = view.getComputedStyle(element);
    assertStyle(element, style);
    if (element.namespaceURI === SVG_NS) {
      if (element.localName !== "svg") unsupported("An equation SVG root is unsupported.");
      paintSVG(element as SVGSVGElement);
      return;
    }
    if (element.localName !== "span")
      unsupported("An equation HTML paint primitive is unsupported.");
    paintBox(element as HTMLElement, style);
    for (const child of element.childNodes) {
      // KaTeX's accessibility-only MathML never participates in its visual layout.
      if (child.nodeType === 1 && (child as Element).classList.contains("katex-mathml")) continue;
      if (child.nodeType === 1) visit(child as Element);
      else if (child.nodeType === 3) paintText(child as Text);
      else unsupported("An equation DOM node is unsupported.");
    }
  };
  visit(root);
  return { operations: Object.freeze(operations), bytes };
}

export function paintEquationDisplayList(
  context: CanvasRenderingContext2D,
  operations: readonly EquationDrawOperation[],
  checkpoint: () => void,
  createPath: (d: string) => Path2D,
): void {
  for (const operation of operations) {
    checkpoint();
    context.save();
    try {
      for (const clip of operation.clips) {
        context.beginPath();
        context.rect(clip.x, clip.y, clip.w, clip.h);
        context.clip();
      }
      // Two distinct sentinels detect silent rejection without misclassifying a
      // valid color that happens to equal either sentinel after normalization.
      context.fillStyle = "#010203";
      context.fillStyle = operation.color;
      const firstColor = context.fillStyle;
      context.fillStyle = "#040506";
      context.fillStyle = operation.color;
      if (context.fillStyle !== firstColor)
        throw new EquationPresentationFailure(
          "canvas",
          "The canvas rejected an equation paint color.",
        );
      if (operation.kind === "rect")
        context.fillRect(operation.x, operation.y, operation.w, operation.h);
      else if (operation.kind === "text") {
        // Reset first: a rejected assignment must not inherit a prior KaTeX face.
        context.font = "10px sans-serif";
        context.font = operation.font;
        if (context.font !== operation.font && !context.font.includes("KaTeX_"))
          throw new EquationPresentationFailure(
            "canvas",
            "The canvas rejected the bundled equation font.",
          );
        context.textAlign = "left";
        context.textBaseline = "alphabetic";
        context.direction = "ltr";
        context.fontKerning = "auto";
        context.fillText(operation.text, operation.x, operation.baseline);
      } else {
        context.transform(...operation.matrix);
        context.fill(createPath(operation.d), operation.fillRule);
      }
    } finally {
      context.restore();
    }
  }
}
