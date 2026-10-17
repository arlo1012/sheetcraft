import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8 } from "fflate/browser";

const namespaces: Record<string, string> = {
  xml: "http://www.w3.org/XML/1998/namespace",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  sheetcraft: "urn:sheetcraft:theme-catalog",
};
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});
const empty = (value: unknown): boolean =>
  value === "" || (typeof value === "object" && value !== null && Object.keys(value).length === 0);

/**
 * The omission of explicit glyph noLine is safe only in the fresh adapter slice.
 * Validate its inheritance sources; never rewrite imported or existing XML.
 * Unknown namespace variants intentionally fail closed, even if locally named alike.
 */
export function assertFreshTextBoxProfile(entries: Record<string, Uint8Array>): void {
  const fail = (): never => {
    throw new Error("Unknown text box inheritance in fresh XLSX export.");
  };
  const themes = Object.keys(entries).filter((part) => /^xl\/theme\/.*\.xml$/.test(part));
  if (themes.length !== 1 || themes[0] !== "xl/theme/theme1.xml") fail();
  for (const [part, bytes] of Object.entries(entries)) {
    const theme = part === "xl/theme/theme1.xml";
    if (!theme && !/^xl\/drawings\/drawing\d+\.xml$/.test(part)) continue;
    const source = strFromU8(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(source) || XMLValidator.validate(source) !== true) fail();
    const document = parser.parse(source) as Record<string, unknown>;
    const rootName = theme ? "a:theme" : "xdr:wsDr";
    const roots = Object.keys(document).filter((key) => key !== "?xml");
    const root = document[rootName];
    if (
      roots.length !== 1 ||
      roots[0] !== rootName ||
      !root ||
      typeof root !== "object" ||
      Array.isArray(root)
    )
      fail();
    const visit = (
      name: string,
      value: unknown,
      inherited: Record<string, string>,
      inText = false,
    ): void => {
      // Each sibling has its own namespace scope, including repeated elements.
      if (Array.isArray(value)) {
        for (const item of value) visit(name, item, inherited, inText);
        return;
      }
      const node = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const scope = { ...inherited };
      for (const [key, val] of Object.entries(node)) {
        if (key === "@_xmlns") fail();
        if (key.startsWith("@_xmlns:")) {
          const prefix = key.slice(8);
          if (namespaces[prefix] !== val) fail();
          scope[prefix] = String(val);
        }
      }
      if (name.split(":").length !== 2) fail();
      const prefix = name.split(":")[0]!;
      if (!namespaces[prefix] || scope[prefix] !== namespaces[prefix]) fail();
      for (const key of Object.keys(node)) {
        if (!key.startsWith("@_") || key.startsWith("@_xmlns:")) continue;
        const attribute = key.slice(2);
        if (!attribute.includes(":")) continue;
        if (attribute.split(":").length !== 2) fail();
        const attributePrefix = attribute.split(":")[0]!;
        if (!namespaces[attributePrefix] || scope[attributePrefix] !== namespaces[attributePrefix])
          fail();
      }
      if (name === "a:objectDefaults") fail();
      if (!theme && ["xdr:style", "a:fontRef", "a:effectRef"].includes(name)) fail();
      if (!theme && name === "a:lstStyle" && !empty(value)) fail();
      const text = inText || name === "xdr:txBody" || name === "a:txBody";
      if (!theme && text) {
        if (
          ["a:effectDag", "a:highlight", "a:uLn", "a:uLnTx", "a:scene3d", "a:sp3d"].includes(name)
        )
          fail();
        if (name === "a:effectLst" && !empty(value)) fail();
        if (
          name === "a:ln" &&
          (!value ||
            typeof value !== "object" ||
            Object.keys(node).length !== 1 ||
            !empty(node["a:noFill"]))
        )
          fail();
      }
      for (const [key, val] of Object.entries(node)) {
        if (key.startsWith("@_") || key === "#text") continue;
        visit(key, val, scope, text);
      }
    };
    visit(rootName, root, { xml: namespaces.xml! });
  }
}
