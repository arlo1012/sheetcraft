import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test } from "vitest";
import { SHAPE_PRESET_GALLERY } from "../../../shared/shape-presets/shape-gallery-data";
import {
  PICTURE_CROP_SHAPE_GALLERY,
  pictureCropShapeChoiceValue,
} from "../../../modules/sheet-images/picture-crop-shape-catalog";
import {
  SHAPE_GALLERY,
  SHAPE_GALLERY_COUNT,
  filterShapeGallery,
  shapeGalleryPreview,
  type ShapeGalleryChoice,
} from "../../../modules/sheet-drawings/shape-gallery";
import ShapeGallery from "../../../modules/sheet-drawings/components/ShapeGallery.vue";

const choices = SHAPE_GALLERY.flatMap((group) => group.items);
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function choice(id: string): ShapeGalleryChoice {
  const item = choices.find((item) => item.id === id);
  if (!item) throw new Error(`Missing shape choice: ${id}`);
  return item;
}
function gallery(selected: ShapeGalleryChoice | null = choice("ellipse")) {
  const wrapper = mount(ShapeGallery, { props: { selected }, attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}
function button(wrapper: VueWrapper, id: string): HTMLButtonElement {
  return wrapper.get(`[data-shape-choice="${id}"]`).element as HTMLButtonElement;
}
async function press(wrapper: VueWrapper, id: string, key: string) {
  await wrapper.get(`[data-shape-choice="${id}"]`).trigger("keydown", { key });
  await nextTick();
}

test("desktop Insert Shapes has 161 distinct choices in all eight category counts", () => {
  expect(SHAPE_GALLERY.map((group) => [group.id, group.items.length])).toEqual([
    ["lines", 12],
    ["rectangles", 9],
    ["basic", 43],
    ["arrows", 27],
    ["equation", 6],
    ["flowchart", 28],
    ["stars", 20],
    ["callouts", 16],
  ]);
  expect(SHAPE_GALLERY_COUNT).toBe(161);
  expect(choices).toHaveLength(161);
  expect(new Set(choices.map((item) => item.id)).size).toBe(161);
  expect(SHAPE_GALLERY.find((group) => group.id === "basic")!.items.slice(0, 3)).toEqual([
    expect.objectContaining({ id: "textBox", kind: "textBox", direction: "horizontal" }),
    expect.objectContaining({ id: "verticalTextBox", kind: "textBox", direction: "vertical" }),
    expect.objectContaining({ id: "ellipse", kind: "preset", preset: "ellipse" }),
  ]);
});

test("picture crop reexports the same shared 147 choices and retains rectangle reset semantics", () => {
  expect(PICTURE_CROP_SHAPE_GALLERY).toBe(SHAPE_PRESET_GALLERY);
  const filled = choices.filter((item) => item.kind === "preset");
  const crop = SHAPE_PRESET_GALLERY.flatMap((group) => group.items);
  expect(filled.map((item) => item.preset)).toEqual(crop.map((item) => item.preset));
  for (const [index, item] of filled.entries()) expect(item.label).toBe(crop[index]!.label);
  expect(pictureCropShapeChoiceValue("rect")).toBeUndefined();
  expect(choice("rect")).toMatchObject({ kind: "preset", preset: "rect" });
});

test("nine line choices carry static path identity and distinct begin/end arrow requests", () => {
  const lines = SHAPE_GALLERY[0]!.items;
  expect(lines.map((item) => item.label["en-US"])).toEqual([
    "Lines",
    "Arrow",
    "Double Arrow",
    "Elbow Connector",
    "Elbow Arrow Connector",
    "Elbow Double-Arrow Connector",
    "Curved Connector",
    "Curved Arrow Connector",
    "Curved Double Arrow Connector",
    "Curve",
    "Freeform",
    "Scribble",
  ]);
  expect(
    lines
      .slice(0, 9)
      .map((item) => (item.kind === "line" ? [item.preset, item.beginArrow, item.endArrow] : null)),
  ).toEqual([
    ["line", "none", "none"],
    ["line", "none", "triangle"],
    ["line", "triangle", "triangle"],
    ["bentConnector3", "none", "none"],
    ["bentConnector3", "none", "triangle"],
    ["bentConnector3", "triangle", "triangle"],
    ["curvedConnector3", "none", "none"],
    ["curvedConnector3", "none", "triangle"],
    ["curvedConnector3", "triangle", "triangle"],
  ]);
  for (const item of lines.slice(9)) {
    expect(item).toMatchObject({ kind: "drawingTool", available: true });
    expect(item).not.toHaveProperty("preset");
    expect(item).not.toHaveProperty("beginArrow");
  }
});

test("all choices use finite standard SVG preview paths, with endpoint arrows and fitted callout tails", () => {
  for (const item of choices) {
    const preview = shapeGalleryPreview(item);
    expect(shapeGalleryPreview(item)).toBe(preview);
    const box = preview.viewBox.split(" ").map(Number);
    expect(box).toHaveLength(4);
    expect(box.every(Number.isFinite)).toBe(true);
    expect(box[2]).toBeGreaterThan(0);
    expect(box[3]).toBeGreaterThan(0);
    expect(preview.paths.length).toBeGreaterThan(0);
    for (const path of [...preview.paths.map((path) => path.d), ...preview.arrows]) {
      expect(path).toMatch(/^M/u);
      expect(path).not.toMatch(/NaN|Infinity|undefined|[<>"&]|https?:/u);
    }
    if (item.kind === "line") {
      expect(preview.paths.every((path) => !path.filled)).toBe(true);
      expect(preview.arrows).toHaveLength(
        Number(item.beginArrow === "triangle") + Number(item.endArrow === "triangle"),
      );
    }
  }
  const calloutBox = shapeGalleryPreview(choice("borderCallout1")).viewBox.split(" ").map(Number);
  expect(calloutBox[0]).toBeLessThan(-1.5);
  expect(calloutBox[3]).toBeGreaterThan(27);
});

test("bilingual search matches either language and categories without changing stored identity", () => {
  expect(filterShapeGallery("  ")).toBe(SHAPE_GALLERY);
  expect(
    filterShapeGallery("Rounded Rectangle")
      .flatMap((group) => group.items)
      .map((item) => item.id),
  ).toContain("roundRect");
  expect(
    filterShapeGallery("不等于号")
      .flatMap((group) => group.items)
      .map((item) => item.id),
  ).toEqual(["mathNotEqual"]);
  expect(
    filterShapeGallery("DoubleArrow")
      .flatMap((group) => group.items)
      .map((item) => item.id),
  ).toContain("doubleArrow");
  expect(filterShapeGallery("基本形状")[0]!.items).toHaveLength(43);
  expect(filterShapeGallery("no such shape")).toEqual([]);
  for (const item of [...SHAPE_GALLERY, ...choices]) {
    expect(item.label["en-US"]).toMatch(/[A-Za-z]/u);
    expect(item.label["zh-CN"]).toMatch(/[\u4e00-\u9fff]/u);
  }
});

test("concrete picker shows all 161 named choices, three distinct drawing gestures and controlled selection", async () => {
  const wrapper = gallery();
  expect(wrapper.findAll("button[data-shape-choice]")).toHaveLength(161);
  expect(wrapper.findAll("button[data-shape-choice]:disabled")).toHaveLength(0);
  expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(1);
  expect(wrapper.findAll('button[aria-pressed="true"]')).toHaveLength(1);
  expect(button(wrapper, "ellipse").getAttribute("aria-pressed")).toBe("true");
  expect(wrapper.text()).toContain("Selected: Oval");
  expect(wrapper.find("img, image, use").exists()).toBe(false);
  for (const id of ["curve", "freeform", "scribble"]) {
    expect(button(wrapper, id).disabled).toBe(false);
    expect(button(wrapper, id).title).toBe(choice(id).label["en-US"]);
    await wrapper.get(`[data-shape-choice="${id}"]`).trigger("click");
  }
  expect(wrapper.emitted("choose")).toEqual([
    [choice("curve")],
    [choice("freeform")],
    [choice("scribble")],
  ]);
  await wrapper.get('[data-shape-choice="heart"]').trigger("click");
  expect(wrapper.emitted("choose")!.at(-1)).toEqual([choice("heart")]);
  expect(button(wrapper, "ellipse").getAttribute("aria-pressed")).toBe("true");
  expect(button(wrapper, "heart").getAttribute("aria-pressed")).toBe("false");
  await wrapper.setProps({ selected: choice("heart") });
  expect(button(wrapper, "heart").getAttribute("aria-pressed")).toBe("true");
  await wrapper.setProps({ selected: null });
  expect(wrapper.findAll('button[aria-pressed="true"]')).toHaveLength(0);
  expect(wrapper.text()).toContain("No shape selected");
});

test("text-box direction and line endpoint selections are emitted without losing their discriminator", async () => {
  const wrapper = gallery();
  for (const id of ["verticalTextBox", "textBox", "curvedDoubleArrowConnector"]) {
    await wrapper.get(`[data-shape-choice="${id}"]`).trigger("click");
    expect(wrapper.emitted("choose")!.at(-1)).toEqual([choice(id)]);
  }
  await wrapper.setProps({ selected: choice("elbowConnector") });
  expect(wrapper.text()).toContain("Automatic connections to other shapes are not available yet");
  expect(wrapper.text()).toContain("Selected: Elbow Connector");
});

test("locale switches labels and feedback while English search continues to work in Chinese", async () => {
  const wrapper = gallery(choice("roundRect"));
  await wrapper.setProps({ locale: "zh-CN" });
  expect(button(wrapper, "roundRect").getAttribute("aria-label")).toBe("圆角矩形");
  expect(wrapper.get('[data-shape-category="basic"]').attributes("aria-label")).toBe("基本形状");
  expect(wrapper.text()).toContain("已选: 圆角矩形");
  await wrapper.get('input[type="search"]').setValue("Rounded Rectangle");
  expect(wrapper.find('[data-shape-choice="roundRect"]').exists()).toBe(true);
  expect(wrapper.text()).toContain(" / 161");
  await wrapper.get('input[type="search"]').setValue("不等于号");
  expect(wrapper.findAll("button[data-shape-choice]")).toHaveLength(1);
  expect(button(wrapper, "mathNotEqual").getAttribute("aria-label")).toBe("不等于号");
  expect(wrapper.text()).toContain("已选: 圆角矩形");
  await wrapper.get('input[type="search"]').setValue("no such shape");
  expect(wrapper.text()).toContain("没有匹配的形状");
  await wrapper.get('input[type="search"]').setValue("");
  expect(wrapper.findAll("button[data-shape-choice]")).toHaveLength(161);
});

test("roving focus uses responsive rows, includes drawing gestures and never changes the selection", async () => {
  const wrapper = gallery();
  button(wrapper, "line").focus();
  await press(wrapper, "line", "ArrowRight");
  expect(document.activeElement).toBe(button(wrapper, "arrow"));
  expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(1);
  await press(wrapper, "arrow", "ArrowDown");
  expect(document.activeElement).toBe(button(wrapper, "scribble"));
  await press(wrapper, "scribble", "ArrowDown");
  expect(document.activeElement).toBe(button(wrapper, "roundRect"));
  await press(wrapper, "roundRect", "ArrowUp");
  expect(document.activeElement).toBe(button(wrapper, "scribble"));
  await press(wrapper, "scribble", "ArrowUp");
  expect(document.activeElement).toBe(button(wrapper, "arrow"));
  await press(wrapper, "arrow", "End");
  expect(document.activeElement).toBe(button(wrapper, "accentBorderCallout3"));
  await press(wrapper, "accentBorderCallout3", "Home");
  expect(document.activeElement).toBe(button(wrapper, "line"));
  await press(wrapper, "line", "ArrowLeft");
  expect(document.activeElement).toBe(button(wrapper, "line"));
  await wrapper.get('input[type="search"]').trigger("keydown", { key: "ArrowUp" });
  expect(document.activeElement).toBe(button(wrapper, "accentBorderCallout3"));
  await wrapper.get('input[type="search"]').setValue("triangle");
  await wrapper.get('input[type="search"]').trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement).toBe(button(wrapper, "triangle"));
  expect(wrapper.emitted("choose")).toBeUndefined();
});

test("disabled picker has no selectable or keyboard-operable choice", async () => {
  const wrapper = gallery();
  await wrapper.setProps({ disabled: true });
  expect(wrapper.findAll("button[data-shape-choice]:disabled")).toHaveLength(161);
  expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(0);
  expect((wrapper.get('input[type="search"]').element as HTMLInputElement).disabled).toBe(true);
  await wrapper.get('[data-shape-choice="heart"]').trigger("click");
  expect(wrapper.emitted("choose")).toBeUndefined();
});
