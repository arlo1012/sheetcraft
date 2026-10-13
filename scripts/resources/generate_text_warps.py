"""Compile the unchanged pinned ECMA-376 XML, never load caller XML at runtime."""
from pathlib import Path
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/core/resources/text-warps/presetTextWarpDefinitions.xml"
OUT = ROOT / "packages/core/src/text-warps"
SHA = "89640bd4aeedfa2c578d1d1acc50d569865ebdef315fd4b468087c25e36acada"
data = SOURCE.read_bytes()
assert len(data) == 51599 and hashlib.sha256(data).hexdigest() == SHA
root = ET.fromstring(data)
ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
operators = {"*/", "+-", "+/", "?:", "abs", "cat2", "cos", "pin", "sat2", "sin", "sqrt", "val"}
angle_constants = {
    "cd2": 10800000, "cd3": 7200000, "cd4": 5400000, "cd8": 2700000,
    "3cd4": 16200000, "3cd8": 8100000, "5cd8": 13500000, "7cd8": 18900000,
}
base_variables = {"w", "h", "l", "t", "r", "b", "hc", "vc", "ss", "ls"} | set(angle_constants)
base_variables.update(f"{prefix}{divisor}" for prefix in ["wd", "hd", "ssd"] for divisor in [2, 3, 4, 5, 6, 8, 10, 12, 16, 32])
# Explicit source classification, independently of thumbnail labels or path-count heuristics.
follow_paths = {"textArchDown", "textArchUp", "textCircle", "textButton"}

def tag(element):
    return element.tag.split("}")[-1]

def json_data(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

def token(value, variables):
    assert isinstance(value, str) and 0 < len(value) <= 128
    assert re.fullmatch(r"-?\d+(?:\.\d+)?", value) or value in variables, f"Unknown guide: {value}"
    return value

def guides(elements, variables):
    out = []
    for element in elements:
        assert set(element.attrib) == {"name", "fmla"}
        name = element.attrib["name"]
        # Standard textButtonPour intentionally reassigns v1 later in source order.
        assert re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", name)
        formula = element.attrib["fmla"].split()
        assert formula[0] in operators
        arity = 1 if formula[0] in {"val", "abs", "sqrt"} else 2 if formula[0] in {"cos", "sin"} else 3
        assert len(formula) == arity + 1
        out.append([name, formula[0], *(token(value, variables) for value in formula[1:])])
        variables.add(name)
    return out

definitions, defaults, symbolic_defaults = {}, {}, []
for shape in root:
    name = tag(shape)
    assert name not in definitions and re.fullmatch(r"text[A-Za-z0-9]+", name)
    assert {tag(child) for child in shape} <= {"avLst", "gdLst", "ahLst", "pathLst"}
    variables = set(base_variables)
    av = guides(shape.findall("a:avLst/a:gd", ns), variables)
    assert len(av) <= 2 and all(guide[1] == "val" for guide in av)
    default_values = {}
    for adjustment, _, value in av:
        if value in angle_constants:
            result = angle_constants[value]
            symbolic_defaults.append({"preset": name, "adjustment": adjustment, "sourceToken": value, "resolvedValue": result})
        else:
            assert re.fullmatch(r"-?\d+(?:\.\d+)?", value), "Defaults must be fixed numeric or standard angle constants"
            result = float(value)
            if result.is_integer():
                result = int(result)
        assert math.isfinite(result) and abs(result) <= 2147483647
        default_values[adjustment] = result
    defaults[name] = default_values
    gd = guides(shape.findall("a:gdLst/a:gd", ns), variables)
    assert not set(default_values) & {guide[0] for guide in gd}
    handles = []
    for handle in shape.findall("a:ahLst/*", ns):
        kind = tag(handle)
        assert kind in {"ahXY", "ahPolar"}
        suffixes = ["X", "Y"] if kind == "ahXY" else ["R", "Ang"]
        allowed = {f"{prefix}{suffix}" for prefix in ["gdRef", "min", "max"] for suffix in suffixes}
        assert set(handle.attrib) <= allowed
        for field, value in handle.attrib.items():
            if field.startswith("gdRef"):
                assert value in default_values
            else:
                token(value, variables)
        position = handle.find("a:pos", ns)
        assert position is not None and set(position.attrib) == {"x", "y"}
        handles.append({"kind": kind, "fields": dict(handle.attrib), "position": [token(position.attrib[key], variables) for key in ["x", "y"]]})
    paths = []
    for path in shape.findall("a:pathLst/a:path", ns):
        # The official text-warp data has no fill, stroke or coordinate-space attributes.
        assert not path.attrib
        commands = []
        for command in path:
            kind = tag(command)
            if kind in {"moveTo", "lnTo", "quadBezTo", "cubicBezTo"}:
                assert not command.attrib
                points = command.findall("a:pt", ns)
                assert len(points) == {"moveTo": 1, "lnTo": 1, "quadBezTo": 2, "cubicBezTo": 3}[kind]
                assert all(set(point.attrib) == {"x", "y"} for point in points)
                commands.append([kind, *(token(point.attrib[key], variables) for point in points for key in ["x", "y"])])
            elif kind == "arcTo":
                assert set(command.attrib) == {"wR", "hR", "stAng", "swAng"}
                commands.append([kind, *(token(command.attrib[key], variables) for key in ["wR", "hR", "stAng", "swAng"])])
            else:
                raise ValueError(f"Unknown/closed text-warp boundary: {kind}")
        assert len(commands) >= 2 and commands[0][0] == "moveTo"
        assert all(command[0] != "moveTo" for command in commands[1:])
        paths.append({"commands": commands})
    assert len(gd) + len(av) <= 128 and 0 < len(paths) <= 6
    assert sum(len(path["commands"]) for path in paths) <= 16 and len(handles) <= 2
    if name in follow_paths:
        assert len(paths) == (3 if name == "textButton" else 1)
        family = "follow-path"
        tracks = [{"pathIndex": index} for index in range(len(paths))]
        bands = []
    else:
        assert len(paths) % 2 == 0
        family = "envelope"
        tracks = []
        bands = [{"topPathIndex": index, "bottomPathIndex": index + 1} for index in range(0, len(paths), 2)]
    definitions[name] = {"guides": gd, "handles": handles, "paths": paths, "family": family, "tracks": tracks, "bands": bands}

assert len(definitions) == 40 and follow_paths <= set(definitions)
assert len(symbolic_defaults) == 4 and all(item["sourceToken"] == "cd2" for item in symbolic_defaults)
assert sum(len(definition["paths"]) for definition in definitions.values()) == 88
notice = (ROOT / "packages/core/resources/text-warps/ECMA-NOTICES.txt").read_text(encoding="utf-8")
assert "*/" not in notice
# A legal comment retains the full applicable notices with emitted/bundled derivatives.
# The resource folder is also retained for source distribution and provenance review.
header = "// Generated from the pinned ECMA-376 text-warp resource; do not edit by hand.\n/*!\n" + notice + "*/\n"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "catalog.ts").write_text(
    header + "export const TEXT_WARP_PRESET_NAMES = Object.freeze(" + json_data(list(definitions)) + " as const);\n"
    + "export type TextWarpPresetName = typeof TEXT_WARP_PRESET_NAMES[number];\n"
    + "export const TEXT_WARP_PRESET_DEFAULTS: Readonly<Record<TextWarpPresetName, Readonly<Record<string, number>>>> = Object.freeze({"
    + ",".join(json_data(name) + ":Object.freeze(" + json_data(values) + ")" for name, values in defaults.items()) + "});\n",
    encoding="utf-8",
)
(OUT / "definitions.ts").write_text(
    'import type { TextWarpDefinition } from "./types.js";\n'
    + 'import type { TextWarpPresetName } from "./catalog.js";\n'
    + header
    + "export const TEXT_WARP_DEFINITIONS: Readonly<Record<TextWarpPresetName, TextWarpDefinition>> = " + json_data(definitions) + ";\n",
    encoding="utf-8",
)
(ROOT / "packages/core/resources/text-warps/compiled-default-resolutions.json").write_text(json.dumps(symbolic_defaults, indent=2) + "\n", encoding="utf-8")
print("Generated", len(definitions), "standard text warps with", len(symbolic_defaults), "fixed symbolic defaults")
