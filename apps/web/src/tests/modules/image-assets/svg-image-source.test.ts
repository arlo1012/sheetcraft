import { afterEach, describe, expect, test, vi } from "vitest";
import {
  inspectSvgImageSource,
  SvgImageSourceError,
  type SvgImageSourceErrorReason,
} from "../../../modules/image-assets/inspectSvgImageSource";
import {
  ImageAssetError,
  MAX_IMAGE_BYTES,
} from "../../../modules/image-assets/imageAssetValidation";

const encode = (value: string) => new TextEncoder().encode(value);
const svg = (content = '<path d="M0 0H8V4H0Z"/>', attributes = 'width="8" height="4"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${content}</svg>`;
const inspect = (content: string) => inspectSvgImageSource(encode(content));
function refusal(content: string, reason: SvgImageSourceErrorReason) {
  try {
    inspect(content);
    throw new Error("Expected SVG refusal");
  } catch (error) {
    expect(error).toBeInstanceOf(SvgImageSourceError);
    expect(error).toBeInstanceOf(ImageAssetError);
    expect(error).toMatchObject({
      reason,
      code: reason === "pixel-limit" ? "pixel-limit" : "invalid-image",
    });
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("static local SVG source before image decoding", () => {
  test("keeps ordinary absolute-sized SVG bytes and conservative dimensions", () => {
    const bytes = encode(svg());
    const result = inspectSvgImageSource(bytes);
    expect(result).toMatchObject({
      width: 8,
      height: 4,
      mimeType: "image/svg+xml",
      normalizedViewport: false,
    });
    expect(result.bytes).toBe(bytes);
  });

  test("accepts normal compact path, geometry, text, transforms and literal inline styles", () => {
    const source = svg(`
      <title>Paths &amp; text</title><desc>A local static picture</desc>
      <g transform="translate(2,3) rotate(10) scale(.5)" fill="none" stroke="#123456" stroke-width="2">
        <path d="M.5-.5l2 3h4v5c1 2 3 4 5 6s1 2 3 4q1 2 3 4t5 6a2 3 10 0 1 4 5z"/>
        <rect x="1" y="1" width="2" height="2" rx=".2"/>
        <circle cx="2" cy="2" r="1"/><ellipse cx="2" cy="2" rx="1" ry="2"/>
        <line x1="0" y1="0" x2="5" y2="5"/>
        <polygon points="0,0 2,0 1,2"/><polyline points="0,0 1,2 2,0"/>
      </g>
      <text x="1" y="3" xml:space="preserve" style="font-family:Arial,sans-serif;font-size:2px;fill:rgb(10,20,30)">Hi &#x4e2d;<tspan dx="1">&lt;svg&gt;</tspan></text>
    `);
    expect(inspect(source).bytes).toEqual(encode(source));
  });

  test("accepts bounded local use, gradients, clipping, masks and static CSS", () => {
    const source = svg(`
      <defs>
        <linearGradient id="base"><stop offset="0%" stop-color="red"/><stop offset="100%" stop-color="#00f"/></linearGradient>
        <linearGradient id="paint" href="#base" gradientTransform="rotate(10)"/>
        <radialGradient id="radial" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="white"/></radialGradient>
        <clipPath id="clip"><circle cx="4" cy="2" r="2"/></clipPath>
        <mask id="mask" maskUnits="userSpaceOnUse" x="0" y="0" width="8" height="4"><rect width="8" height="4" fill="white"/></mask>
        <g id="shape"><rect width="8" height="4"/></g>
      </defs>
      <style>.paint {fill:url('#paint');stroke:blue;stroke-width:1} #second {fill: url(#radial)}</style>
      <g opacity=".5" clip-path="url(#clip)" mask="url(#mask)"><use class="paint" href="#shape"/></g>
      <use id="second" href="#shape"/>
    `);
    expect(inspect(source).normalizedViewport).toBe(false);
  });

  test("accepts xlink local references and a UTF-8 declaration/BOM/subview", () => {
    const text =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      svg(
        '<defs><path id="p" d="M0 0L8 4"/></defs><use xlink:href="#p"/>',
        'xmlns:xlink="http://www.w3.org/1999/xlink" width="8" height="4"',
      );
    const encoded = encode(text);
    const padded = new Uint8Array(encoded.length + 5);
    padded.set([0xef, 0xbb, 0xbf], 1);
    padded.set(encoded, 4);
    const source = padded.subarray(1, padded.length - 1);
    expect(inspectSvgImageSource(source).bytes).toBe(source);
  });

  test.each([
    ['width="1in" height="72pt"', 96, 96],
    ['width="2.54cm" height="25.4mm"', 96, 96],
    ['width="6pc" height="101.6Q"', 96, 96],
    ['width="1.25px" height="2.5"', 2, 3],
    ['width="8000" height="4000"', 8000, 4000],
  ] as const)("budgets absolute dimensions %s without rewriting", (attributes, width, height) => {
    expect(inspect(svg("", attributes))).toMatchObject({
      width,
      height,
      normalizedViewport: false,
    });
  });

  test.each([
    ['viewBox="0 0 24 24"', 150, 150],
    ['viewBox="0 0 200 100"', 300, 150],
    ['viewBox="0 0 100 400"', 38, 150],
    ['width="80" viewBox="0 0 2 1"', 80, 40],
    ['height="40" viewBox="0 0 2 1"', 80, 40],
    ['width="100%" height="auto" viewBox="0 0 2 1"', 300, 150],
    ["", 300, 150],
    ['width="20"', 20, 150],
  ] as const)("resolves a deterministic viewport for %s", (attributes, width, height) => {
    const result = inspect(svg('<circle cx="1" cy="1" r="1"/>', attributes));
    expect(result).toMatchObject({ width, height, normalizedViewport: true });
    const normalized = new TextDecoder().decode(result.bytes);
    expect(normalized).toContain("<circle");
    expect(normalized).toMatch(/width="[0-9.]+px"/);
    expect(normalized).toMatch(/height="[0-9.]+px"/);
    expect(inspectSvgImageSource(result.bytes)).toMatchObject({
      width,
      height,
      normalizedViewport: false,
    });
  });

  test("root inline sizing takes precedence and is fixed when percentages are resolved", () => {
    expect(inspect(svg("", 'width="16385" height="4" style="width:8px;height:4px"'))).toMatchObject(
      { width: 8, height: 4 },
    );
    const result = inspect(svg("", 'viewBox="0 0 2 1" style="width:100%;height:auto;fill:red"'));
    expect(result).toMatchObject({ width: 300, height: 150, normalizedViewport: true });
    expect(new TextDecoder().decode(result.bytes)).toContain("fill:red");
    refusal(svg("", 'width="8" height="4" style="width:16385px"'), "pixel-limit");
  });

  test("viewport normalization preserves important non-sizing declarations", () => {
    const result = inspect(
      svg(
        '<style>svg {fill:blue!important}</style><rect width="10" height="10"/>',
        'viewBox="0 0 10 10" style="width:100%;fill:red!important"',
      ),
    );
    expect(result.normalizedViewport).toBe(true);
    expect(new TextDecoder().decode(result.bytes)).toContain("fill:red!important");
  });

  test.each([
    ["<script>alert(1)</script>", "unsafe-content"],
    [
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>',
      "unsafe-content",
    ],
    ['<a href="https://example.com"><rect width="1" height="1"/></a>', "unsafe-content"],
    ['<animate attributeName="width" values="1;100000"/>', "unsafe-content"],
    ['<set attributeName="fill" to="red"/>', "unsafe-content"],
    ['<rect width="1" height="1" onclick="alert(1)"/>', "unsafe-content"],
    ['<rect width="1" height="1" onload="alert(1)"/>', "unsafe-content"],
    ['<g xml:base="https://example.com/"><use href="#x"/></g>', "unsafe-content"],
    ['<use href="https://example.com/p.svg#p"/>', "external-resource"],
    ['<use href="data:image/svg+xml;base64,PHN2Zz4="/>', "external-resource"],
    ['<use href="javascript:alert(1)"/>', "external-resource"],
    ['<use href="&#104;ttps://example.com/x"/>', "external-resource"],
    ['<rect fill="url(https://example.com/paint)"/>', "external-resource"],
    ['<rect style="fill:url(data:image/png;base64,abc)"/>', "external-resource"],
    ['<rect style="fill:u\\72l(https://example.com/)"/>', "unsupported-feature"],
    ["<style>@import url(https://example.com/style.css);</style>", "unsupported-feature"],
    [
      "<style>@font-face {font-family:x;src:url(https://example.com/font.woff)}</style>",
      "unsupported-feature",
    ],
    ["<style>.unused{fill:url(https://example.com/x)}</style>", "external-resource"],
    ["<style>rect{animation: pulse 1s infinite}</style>", "unsupported-feature"],
    ["<style>rect{width:100000px}</style>", "unsupported-feature"],
    ['<rect style="fill:var(--color)"/>', "unsupported-feature"],
    ['<image href="data:image/png;base64,abc"/>', "unsupported-feature"],
    ['<filter id="f"><feGaussianBlur stdDeviation="100000"/></filter>', "unsupported-feature"],
    [
      '<pattern id="p" width=".000001" height=".000001"><rect width="1" height="1"/></pattern>',
      "unsupported-feature",
    ],
    ['<svg width="1" height="1"/>', "unsupported-feature"],
    ['<rect unknownVisualFeature="1"/>', "unsupported-feature"],
  ] as const)("refuses active, remote or unbounded visible content: %s", (content, reason) => {
    const image = vi.fn();
    const objectUrl = vi.fn();
    vi.stubGlobal("Image", image);
    vi.stubGlobal("URL", { createObjectURL: objectUrl });
    refusal(svg(content), reason);
    expect(image).not.toHaveBeenCalled();
    expect(objectUrl).not.toHaveBeenCalled();
  });

  test.each([
    ['<!DOCTYPE svg SYSTEM "https://example.com/x.dtd">' + svg(), "unsafe-content"],
    ['<!DOCTYPE svg [<!ENTITY x "abc">]>' + svg("<text>&x;</text>"), "unsafe-content"],
    ['<?xml-stylesheet href="https://example.com/style.css"?>' + svg(), "unsafe-content"],
    ['<?xml version="1.0" encoding="UTF-16"?>' + svg(), "unsafe-content"],
    [svg("<text>&unknown;</text>"), "unsafe-content"],
    [svg("<text>&#0;</text>"), "invalid-xml"],
    [svg("<text>&#xD800;</text>"), "invalid-xml"],
    [svg("<text>&#x110000;</text>"), "invalid-xml"],
    [svg("<g></rect>"), "invalid-xml"],
    [svg() + svg(), "invalid-xml"],
    ['<svg xmlns="http://www.w3.org/1999/xhtml" width="8" height="4"/>', "invalid-xml"],
    [svg('<rect width="1" width="2"/>'), "invalid-xml"],
    [svg('<rect id="same"/><circle id="same"/>'), "invalid-xml"],
    [svg("<rect width=1/>"), "invalid-xml"],
    [svg('<rect fill="a<b"/>'), "invalid-xml"],
    [svg("<text>unescaped & text</text>"), "invalid-xml"],
  ] as const)("fails closed on XML hazards: %s", (content, reason) => refusal(content, reason));

  test("rejects malformed UTF-8 and byte excess before XML parsing", () => {
    expect(() => inspectSvgImageSource(Uint8Array.of(0xc0, 0xaf))).toThrowError(
      expect.objectContaining({ reason: "invalid-xml" }),
    );
    const parser = vi.fn();
    vi.stubGlobal("DOMParser", parser);
    expect(() => inspectSvgImageSource(new Uint8Array(MAX_IMAGE_BYTES + 1))).toThrowError(
      expect.objectContaining({ code: "too-large" }),
    );
    refusal(svg("<!DOCTYPE evil>"), "unsafe-content");
    expect(parser).not.toHaveBeenCalled();
  });

  test.each([
    ['width="0" height="1"', "invalid-dimensions"],
    ['width="-1" height="1"', "invalid-dimensions"],
    ['width="16385" height="1"', "pixel-limit"],
    ['width="8192" height="4097"', "pixel-limit"],
    ['viewBox="0 0 0 1"', "invalid-dimensions"],
    ['viewBox="0 0 1e-100 1"', "complexity-limit"],
    ['width="10em" height="10em"', "unsupported-feature"],
    ['width="calc(100px)" height="1"', "unsupported-feature"],
  ] as const)("checks dimensions and viewBox before decode: %s", (attributes, reason) =>
    refusal(svg("", attributes), reason),
  );

  test.each([
    ['<use id="a" href="#a"/>', "unsafe-content"],
    ['<g id="a"><use href="#a"/></g>', "unsafe-content"],
    ['<defs><g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g></defs>', "unsafe-content"],
    [
      '<defs><linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/></defs>',
      "unsafe-content",
    ],
    ['<use href="#missing"/>', "unsupported-feature"],
    ['<defs><clipPath id="clip"/></defs><rect fill="url(#clip)"/>', "unsupported-feature"],
    ['<g transform="scale(1025)"><rect width="1" height="1"/></g>', "complexity-limit"],
    [
      '<g transform="scale(32)"><g transform="scale(33)"><rect width="1" height="1"/></g></g>',
      "complexity-limit",
    ],
    ['<rect x="1e100" width="1" height="1"/>', "complexity-limit"],
    ['<path d="M0 0 L"/>', "unsupported-feature"],
    ['<path d="M0 0 A1 1 0 2 0 2 2"/>', "unsupported-feature"],
    ['<path d="M0 0L10 10" stroke-dasharray=".0000001 .0000001"/>', "complexity-limit"],
    ['<mask id="m"><rect width="1" height="1"/></mask>', "unsupported-feature"],
    ['<mask id="m" maskUnits="userSpaceOnUse" width="16385" height="1"/>', "pixel-limit"],
  ] as const)("bounds local graph, surfaces and complexity: %s", (content, reason) =>
    refusal(svg(content), reason),
  );

  test("rejects exponential local-use expansion even when acyclic", () => {
    const defs = ['<g id="n0"><rect width="1" height="1"/></g>'];
    for (let index = 1; index <= 14; index++)
      defs.push(`<g id="n${index}"><use href="#n${index - 1}"/><use href="#n${index - 1}"/></g>`);
    refusal(svg(`<defs>${defs.join("")}</defs><use href="#n14"/>`), "complexity-limit");
  });

  test("budgets repeated full-viewport opacity layers independently of node count", () => {
    refusal(
      svg(
        '<defs><g id="layer" opacity=".5"><rect width="8192" height="4096"/></g></defs>' +
          '<use href="#layer"/>'.repeat(5),
        'width="8192" height="4096"',
      ),
      "complexity-limit",
    );
  });

  test("budgets explicitly inherited group opacity surfaces", () => {
    refusal(
      svg(
        '<g opacity=".5">' +
          '<g opacity="inherit"><rect width="1" height="1"/>'.repeat(9) +
          "</g>".repeat(9) +
          "</g>",
        'width="4096" height="4096"',
      ),
      "complexity-limit",
    );
  });

  test("budgets repeated dashed geometry rather than unique XML nodes only", () => {
    refusal(
      svg(
        '<defs><path id="p" d="M0 1L1000 1" stroke="black" stroke-dasharray=".1 .1"/></defs>' +
          '<use href="#p"/>'.repeat(1000),
        'width="1024" height="16"',
      ),
      "complexity-limit",
    );
  });

  test("accounts for transformed dash complexity with non-scaling stroke", () => {
    refusal(
      svg(
        '<path d="M0 0L100 0" transform="scale(1024)" vector-effect="non-scaling-stroke" stroke="black" stroke-dasharray=".1 .1"/>',
        'width="1024" height="16"',
      ),
      "complexity-limit",
    );
  });

  test("caps structure and text before constructing an inert DOM", () => {
    const parser = vi.fn();
    vi.stubGlobal("DOMParser", parser);
    refusal(svg("<g>".repeat(33) + "</g>".repeat(33)), "complexity-limit");
    refusal(svg("<rect/>".repeat(2048)), "complexity-limit");
    refusal(svg("<text>" + "a".repeat(256 * 1024 + 1) + "</text>"), "complexity-limit");
    expect(parser).not.toHaveBeenCalled();
  });
});
