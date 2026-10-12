import { mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import SheetImageContent from "../../../../../modules/sheet-images/components/SheetImageContent.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { framedCellPicture } from "../../cell-picture-fixture";
import * as sourcePresentation from "../../../../../modules/sheet-images/picture-source-presentation";
import { captureCellPictureSourcePresentation } from "../../../../../modules/sheet-images/cell-picture-presentation";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";

const wrappers: Array<ReturnType<typeof mount>> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});
function canvas(source = "data:image/png;base64,view") {
  return {
    width: 280,
    height: 190,
    toDataURL: vi.fn(() => source),
  } as unknown as HTMLCanvasElement;
}
function fixture() {
  const image = framedCellPicture();
  image.frame.cropShape = { preset: "ellipse" };
  const wrapper = mount(SheetImageContent, {
    props: { src: "blob:original", altText: image.altText, cellImage: image },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return { image, wrapper };
}
async function load(wrapper: ReturnType<typeof mount>) {
  const probe = wrapper.get(".sheet-image-content__probe");
  Object.defineProperties(probe.element, {
    naturalWidth: { value: 400 },
    naturalHeight: { value: 200 },
  });
  await probe.trigger("load");
  return probe;
}

test("a framed cell uses a view raster for genuine source/mask geometry even before it has appearance", async () => {
  const output = canvas();
  const render = vi
    .spyOn(sourcePresentation, "createPictureSourcePresentationCanvas")
    .mockReturnValue(output);
  const { image, wrapper } = fixture();
  image.transform = undefined;
  const before = structuredClone(image);
  expect(wrapper.find("svg image").exists()).toBe(false);
  await load(wrapper);
  expect(render).toHaveBeenCalledWith(
    expect.anything(),
    captureCellPictureSourcePresentation(image),
    undefined,
    undefined,
  );
  expect(wrapper.get("svg").attributes("viewBox")).toBe("0 0 280 190");
  expect(wrapper.get("svg image").attributes("href")).toBe("data:image/png;base64,view");
  expect(wrapper.get("img").attributes("src")).toBe("blob:original");
  expect(image).toEqual(before);
  wrapper.unmount();
  expect([output.width, output.height]).toEqual([0, 0]);
});

test("new source generation releases the old view and ignores a previous probe's late load and error", async () => {
  const oldCanvas = canvas("data:image/png;base64,old"),
    newCanvas = canvas("data:image/png;base64,new");
  const render = vi
    .spyOn(sourcePresentation, "createPictureSourcePresentationCanvas")
    .mockReturnValueOnce(oldCanvas)
    .mockReturnValueOnce(newCanvas);
  const { wrapper } = fixture();
  const oldProbe = await load(wrapper);
  await wrapper.setProps({ src: "blob:new-source" });
  expect([oldCanvas.width, oldCanvas.height]).toEqual([0, 0]);
  expect(wrapper.find("svg image").exists()).toBe(false);
  await oldProbe.trigger("load");
  await oldProbe.trigger("error");
  expect(render).toHaveBeenCalledOnce();
  expect(wrapper.find("[role=status]").exists()).toBe(false);
  await load(wrapper);
  expect(render).toHaveBeenCalledTimes(2);
  expect(wrapper.get("svg image").attributes("href")).toBe("data:image/png;base64,new");
  expect(wrapper.get("img").attributes("src")).toBe("blob:new-source");
});

test("controlled cell appearance updates release the prior view and keep the original source", async () => {
  const first = canvas(),
    second = canvas("data:image/png;base64,edited");
  const render = vi
    .spyOn(sourcePresentation, "createPictureSourcePresentationCanvas")
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second);
  const { image, wrapper } = fixture();
  await load(wrapper);
  const updated = structuredClone(image);
  updated.frame.angleDeg = 58;
  const theme = DEFAULT_WORKBOOK_THEME;
  const resources = { theme };
  await wrapper.setProps({ cellImage: updated, paintResources: resources });
  expect([first.width, first.height]).toEqual([0, 0]);
  expect(render).toHaveBeenLastCalledWith(
    expect.anything(),
    captureCellPictureSourcePresentation(updated),
    theme,
    resources,
  );
  expect(wrapper.get("svg image").attributes("href")).toBe("data:image/png;base64,edited");
  expect(wrapper.get("img").attributes("src")).toBe("blob:original");
});

test.each(["paint", "encoding"] as const)(
  "%s failure never exposes the original source as a framed preview",
  async (kind) => {
    const output = canvas();
    if (kind === "encoding")
      vi.mocked(output.toDataURL).mockImplementation(() => {
        throw new Error("Unavailable pixels");
      });
    vi.spyOn(sourcePresentation, "createPictureSourcePresentationCanvas").mockImplementation(() => {
      if (kind === "paint") throw new Error("Missing texture");
      return output;
    });
    const { wrapper } = fixture();
    await load(wrapper);
    expect(wrapper.find("svg image").exists()).toBe(false);
    expect(wrapper.get("[role=status]").text()).toBe("The image file is unavailable.");
    if (kind === "encoding") expect([output.width, output.height]).toEqual([0, 0]);
  },
);

test("a source decode error persists until a new generation is loaded", async () => {
  const { wrapper } = fixture();
  await wrapper.get("img").trigger("error");
  expect(wrapper.find("svg image").exists()).toBe(false);
  expect(wrapper.get("[role=status]").text()).toBe("The image file is unavailable.");
  await wrapper.setProps({ src: "blob:replacement" });
  expect(wrapper.find("[role=status]").exists()).toBe(false);
});

test("returning to a previous URL still rejects that URL's older probe generation", async () => {
  const output = canvas();
  const render = vi
    .spyOn(sourcePresentation, "createPictureSourcePresentationCanvas")
    .mockReturnValue(output);
  const { wrapper } = fixture();
  const original = wrapper.get("img");
  Object.defineProperties(original.element, {
    naturalWidth: { value: 400 },
    naturalHeight: { value: 200 },
  });
  await wrapper.setProps({ src: "blob:second" });
  await wrapper.setProps({ src: "blob:original" });
  await original.trigger("load");
  expect(render).not.toHaveBeenCalled();
  await load(wrapper);
  expect(render).toHaveBeenCalledOnce();
  expect(wrapper.get("svg image").attributes("href")).toBe("data:image/png;base64,view");
});
