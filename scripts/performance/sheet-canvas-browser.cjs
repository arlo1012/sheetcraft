/**
 * Browser actions for the Sheet Canvas benchmark.
 *
 * The caller loads `output/playwright/sheet-canvas-fixture.json` into the
 * app's IndexedDB record, reloads the page, and sets the viewport to 1440 by
 * 960 before calling one of these functions with a Playwright `page`. This
 * module deliberately has no Playwright dependency so it can be passed to
 * `playwright-cli run-code` or another browser runner unchanged.
 */

async function begin(page) {
  await page.evaluate(() => {
    window.__sheetCanvasBenchmarkObserver?.disconnect();
    const metrics = { active: true, startedAt: performance.now(), frames: [], longTasks: [] };
    let previous;
    const frame = (time) => {
      if (!metrics.active) return;
      if (previous !== undefined) metrics.frames.push(time - previous);
      previous = time;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const observer = new PerformanceObserver((entries) => {
      metrics.longTasks.push(...entries.getEntries().map((entry) => entry.duration));
    });
    observer.observe({ type: "longtask", buffered: false });
    window.__sheetCanvasBenchmark = metrics;
    window.__sheetCanvasBenchmarkObserver = observer;
  });
}

async function finish(page, extra = {}) {
  return page.evaluate((extraMetrics) => {
    const metrics = window.__sheetCanvasBenchmark;
    const observer = window.__sheetCanvasBenchmarkObserver;
    metrics.longTasks.push(...(observer?.takeRecords() ?? []).map((entry) => entry.duration));
    observer?.disconnect();
    delete window.__sheetCanvasBenchmarkObserver;
    metrics.active = false;
    metrics.endedAt = performance.now();
    metrics.nodes = document.getElementsByTagName("*").length;
    metrics.gridCells = document.querySelectorAll("[role=gridcell]").length;
    metrics.canvases = document.querySelectorAll("canvas").length;
    return { ...metrics, ...extraMetrics };
  }, extra);
}

async function scrollBenchmark(page) {
  await begin(page);
  await page.mouse.move(750, 500);
  for (let index = 0; index < 12; index += 1) {
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(250);
  return finish(page, { action: "scroll" });
}

async function zoomBenchmark(page) {
  await begin(page);
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Zoom out" }).click();
  }
  await page.waitForTimeout(300);
  return finish(page, {
    action: "zoom",
    computedZoom: await page
      .locator(".sheet-grid")
      .evaluate((element) => getComputedStyle(element).zoom),
  });
}

async function zoomToTenPercentBenchmark(page) {
  await begin(page);
  const slider = page.getByRole("slider", { name: "Zoom slider" });
  while (Number(await slider.inputValue()) > 10) {
    await page.getByRole("button", { name: "Zoom out" }).click();
  }
  await page.waitForTimeout(300);
  return finish(page, {
    action: "zoomToTenPercent",
    computedZoom: await page
      .locator(".sheet-grid")
      .evaluate((element) => getComputedStyle(element).zoom),
  });
}

async function dragSelectionBenchmark(page) {
  await begin(page);
  const start = { x: 260, y: 460 };
  const end = { x: 1170, y: 790 };
  const steps = 36;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await page.mouse.move(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  return finish(page, { action: "dragSelection" });
}

module.exports = {
  scrollBenchmark,
  zoomBenchmark,
  zoomToTenPercentBenchmark,
  dragSelectionBenchmark,
};
