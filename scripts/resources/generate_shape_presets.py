"""Compile the pinned DrawingML data; this is not a runtime XML/code loader."""
from pathlib import Path
import hashlib
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/core/resources/shape-presets/presetShapeDefinitions.xml"
OUT = ROOT / "packages/core/src/shape-presets"
SHA = "4a762444d8d85876881c02a5b1dedf6f73006fcd8acb7b4e393435615b37c780"
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SHA
root = ET.fromstring(SOURCE.read_bytes())
ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
def tag(e): return e.tag.split("}")[-1]
def json_data(value): return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
operators = {"*/", "+-", "+/", "?:", "abs", "at2", "cat2", "cos", "max", "min", "mod", "pin", "sat2", "sin", "sqrt", "tan", "val"}
fill_modes = {"norm", "none", "lighten", "lightenLess", "darken", "darkenLess"}
base_variables = {"w", "h", "l", "t", "r", "b", "hc", "vc", "ss", "ls", "cd2", "cd3", "cd4", "cd8", "3cd4", "3cd8", "5cd8", "7cd8"}
base_variables.update(f"{prefix}{divisor}" for prefix in ["wd", "hd", "ssd"] for divisor in [2, 3, 4, 5, 6, 8, 10, 12, 16, 32])
def metadata_token(value, variables):
    assert isinstance(value, str) and 0 < len(value) <= 128
    assert re.fullmatch(r"-?\d+(?:\.\d+)?", value) or value in variables, f"Unknown metadata guide: {value}"
    return value
corrections = []
allowed_trailing_zeros = {("circularArrow", "xB"), ("circularArrow", "yB"), ("leftCircularArrow", "xB"), ("leftCircularArrow", "yB"), ("leftRightCircularArrow", "xB"), ("leftRightCircularArrow", "yB"), ("leftRightCircularArrow", "xJ"), ("leftRightCircularArrow", "yJ")}
def guides(elements, preset):
    out = []
    for e in elements:
        formula = e.attrib["fmla"].split()
        assert formula[0] in operators
        if (preset, e.attrib["name"]) in allowed_trailing_zeros:
            assert formula[0] == "+-" and len(formula) == 5 and formula[-1] == "0"
            corrections.append({"preset": preset, "guide": e.attrib["name"], "source": " ".join(formula), "compiled": " ".join(formula[:-1])})
            formula = formula[:-1]
        arity = 1 if formula[0] in {"val", "abs", "sqrt"} else 2 if formula[0] in {"at2", "cos", "sin", "tan", "max", "min"} else 3
        assert len(formula) == arity + 1
        out.append([e.attrib["name"], *formula])
    return out

definitions, defaults = {}, {}
for shape in root:
    name = tag(shape)
    assert name not in definitions
    av = guides(shape.findall("a:avLst/a:gd", ns), name)
    assert all(x[1] == "val" and len(x) == 3 for x in av)
    defaults[name] = {x[0]: float(x[2]) for x in av}
    handles = []
    for h in shape.findall("a:ahLst/*", ns):
        pos = h.find("a:pos", ns)
        assert pos is not None
        handles.append({"kind": tag(h), "fields": dict(h.attrib), "position": [pos.attrib["x"], pos.attrib["y"]]})
    paths = []
    for p in shape.findall("a:pathLst/a:path", ns):
        commands = []
        for c in p:
            kind = tag(c)
            if kind in {"moveTo", "lnTo", "quadBezTo", "cubicBezTo"}:
                points = c.findall("a:pt", ns)
                assert len(points) == {"moveTo": 1, "lnTo": 1, "quadBezTo": 2, "cubicBezTo": 3}[kind]
                commands.append([kind, *(coordinate for pt in points for coordinate in [pt.attrib["x"], pt.attrib["y"]])])
            elif kind == "arcTo": commands.append([kind, *(c.attrib[k] for k in ["wR", "hR", "stAng", "swAng"])])
            elif kind == "close": commands.append([kind])
            else: raise ValueError(kind)
        fill_mode = p.attrib.get("fill", "norm")
        assert fill_mode in fill_modes
        assert p.attrib.get("stroke", "true") in {"true", "false"}
        paths.append({"fillMode": fill_mode, "stroke": p.attrib.get("stroke", "true") != "false", "width": p.attrib.get("w"), "height": p.attrib.get("h"), "commands": commands})
    gd = guides(shape.findall("a:gdLst/a:gd", ns), name)
    variables = base_variables | set(defaults[name]) | {g[0] for g in gd}
    rect = shape.find("a:rect", ns)
    text_rect = None
    if rect is not None:
        assert set(rect.attrib) == {"l", "t", "r", "b"}
        text_rect = [metadata_token(rect.attrib[k], variables) for k in ["l", "t", "r", "b"]]
    connection_sites = []
    for cxn in shape.findall("a:cxnLst/a:cxn", ns):
        pos = cxn.find("a:pos", ns)
        assert set(cxn.attrib) == {"ang"} and pos is not None and set(pos.attrib) == {"x", "y"}
        connection_sites.append({"angle": metadata_token(cxn.attrib["ang"], variables), "position": [metadata_token(pos.attrib[k], variables) for k in ["x", "y"]]})
    assert len(gd) <= 512 and len(paths) <= 16 and sum(len(p["commands"]) for p in paths) <= 1024 and len(handles) <= 16 and len(connection_sites) <= 16
    definitions[name] = {"guides": gd, "handles": handles, "paths": paths, "textRect": text_rect, "connectionSites": connection_sites}
assert len(definitions) == 187
assert len(corrections) == 8
(ROOT / "packages/core/resources/shape-presets/compiled-corrections.json").write_text(json.dumps(corrections, indent=2) + "\n")
filled = [name for name, definition in definitions.items() if any(path["fillMode"] != "none" and len(path["commands"]) > 2 for path in definition["paths"])]
header = "// Generated from the pinned licensed source; do not edit by hand.\n"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "catalog.ts").write_text(header + "export const SHAPE_PRESET_NAMES = " + json_data(list(definitions)) + " as const;\nexport type ShapePresetName = typeof SHAPE_PRESET_NAMES[number];\nexport const SHAPE_PRESET_DEFAULTS: Readonly<Record<ShapePresetName, Readonly<Record<string, number>>>> = " + json_data(defaults) + ";\nexport const SHAPE_PRESET_FILLED_NAMES = " + json_data(filled) + " as const;\n")
(OUT / "definitions.ts").write_text(header + 'import type { ShapePresetDefinition } from "./types.js";\nimport type { ShapePresetName } from "./catalog.js";\nexport const SHAPE_PRESET_DEFINITIONS: Readonly<Record<ShapePresetName, ShapePresetDefinition>> = ' + json_data(definitions) + ";\n")
print("Generated", len(definitions), "distinct preset geometries")
