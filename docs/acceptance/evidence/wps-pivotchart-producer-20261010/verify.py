#!/usr/bin/env python3
"""Verify preserved native producer bytes and its bounded chart contract."""
import hashlib
import json
import posixpath
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
NS = {
    "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def relationships(parts, part):
    directory, filename = posixpath.split(part)
    rels = posixpath.join(directory, "_rels", filename + ".rels")
    return {
        item.attrib["Id"]: (
            item.attrib["Type"],
            posixpath.normpath(posixpath.join(directory, item.attrib["Target"])),
        )
        for item in ET.fromstring(parts[rels])
    }


def cell(parts, sheet_part, address):
    root = ET.fromstring(parts[sheet_part])
    node = root.find(f'.//s:c[@r="{address}"]/s:v', NS)
    assert node is not None, (sheet_part, address)
    return float(node.text)


manifest = json.loads((ROOT / "manifest.json").read_text())
results = []
expected = {
    "native-created.xlsx": (100, 100, 520),
    "native-source-edited-stale.xlsx": (110, 100, 520),
    "native-refreshed.xlsx": (110, 110, 530),
}
for record in manifest["files"]:
    data = (ROOT / record["path"]).read_bytes()
    assert digest(data) == record["published_sha256"], record["path"]
    if not record["path"].endswith(".xlsx"):
        continue
    with zipfile.ZipFile(ROOT / record["path"]) as archive:
        assert archive.testzip() is None
        parts = {item.filename: archive.read(item) for item in archive.infolist()}
    for part, hashes in record["parts"].items():
        assert digest(parts[part]) == hashes["published_sha256"], part
        if not part.startswith("docProps/"):
            assert hashes["original_sha256"] == hashes["published_sha256"], part
    assert b'name="ICV"' not in parts["docProps/custom.xml"]
    workbook = ET.fromstring(parts["xl/workbook.xml"])
    rels = relationships(parts, "xl/workbook.xml")
    sheets = {
        item.attrib["name"]: rels[item.attrib[f'{{{NS["r"]}}}id']][1]
        for item in workbook.findall("s:sheets/s:sheet", NS)
    }
    chart = ET.fromstring(parts["xl/charts/chart1.xml"])
    assert chart.findtext("c:pivotSource/c:name", namespaces=NS) == (
        "[sc-pivot.xlsx]Sheet2!PivotTable1"
    )
    assert chart.find("c:pivotSource/c:fmtId", NS).attrib["val"] == "0"
    bar = chart.find("c:chart/c:plotArea/c:barChart", NS)
    assert bar.find("c:barDir", NS).attrib["val"] == "col"
    assert bar.find("c:grouping", NS).attrib["val"] == "clustered"
    series = bar.findall("c:ser", NS)
    assert len(series) == 2
    names = [item.findtext("c:tx/c:strRef/c:strCache/c:pt/c:v", namespaces=NS)
             for item in series]
    assert names == ["apple", "pear"]
    categories = [item.text for item in series[0].findall(
        "c:cat/c:strRef/c:strCache/c:pt/c:v", NS)]
    assert categories == ["east", "north", "south"]
    values = [[float(item.text) for item in series_node.findall(
        "c:val/c:numRef/c:numCache/c:pt/c:v", NS)] for series_node in series]
    source, cached, total = expected[record["path"]]
    assert values == [[60, cached, 120], [70, 80, 90]]
    assert cell(parts, sheets["Sheet1"], "C2") == source
    assert cell(parts, sheets["Sheet2"], "B6") == cached
    assert cell(parts, sheets["Sheet2"], "D8") == total
    assert sum(sum(items) for items in values) == total
    pivot = ET.fromstring(parts["xl/pivotTables/pivotTable1.xml"])
    assert pivot.attrib["name"] == "PivotTable1"
    drawing_rel = next(value for value in relationships(parts, sheets["Sheet2"]).values()
                       if value[0].endswith("/drawing"))
    drawing = ET.fromstring(parts[drawing_rel[1]])
    chart_ref = drawing.find(".//c:chart", NS)
    assert chart_ref is not None
    chart_target = relationships(parts, drawing_rel[1])[chart_ref.attrib[
        f'{{{NS["r"]}}}id']]
    assert chart_target[0].endswith("/chart")
    assert chart_target[1] == "xl/charts/chart1.xml"
    content_types = {item.attrib.get("PartName"): item.attrib.get("ContentType")
                     for item in ET.fromstring(parts["[Content_Types].xml"])}
    assert content_types["/xl/charts/chart1.xml"] == (
        "application/vnd.openxmlformats-officedocument.drawingml.chart+xml")
    assert content_types["/" + drawing_rel[1]] == (
        "application/vnd.openxmlformats-officedocument.drawing+xml")
    results.append({"file": record["path"], "source_value": source,
                    "north_apple": cached, "grand_total": total,
                    "pivot_source": "[sc-pivot.xlsx]Sheet2!PivotTable1"})
print(json.dumps({"verified_files": len(manifest["files"]), "producer_cases": results,
                  "non_docProps_bytes_preserved": True,
                  "published_copies_gui_retested": False}, indent=2))
