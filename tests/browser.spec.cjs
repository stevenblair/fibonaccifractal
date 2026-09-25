const { test: base, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createServer } = require("../scripts/serve.cjs");

const test = base.extend({
  serverURL: [async ({}, use) => {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      await use(`http://127.0.0.1:${server.address().port}`);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }, { scope: "worker" }],
  baseURL: async ({ serverURL }, use) => use(serverURL),
});

const pageErrors = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openView(page, url = "/") {
  await page.goto(url);
  await expect(page.locator("#viewport")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#render-status")).toBeHidden();
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(() => paintedPixels(page)).toBeGreaterThan(500);
}

async function imageData(page) {
  const data = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL());
  return createHash("sha256").update(data).digest("hex");
}

function paintedPixels(page) {
  return page.locator("canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] && Math.abs(pixels[i] - 19) + Math.abs(pixels[i + 1] - 28) + Math.abs(pixels[i + 2] - 24) > 45) count += 1;
    }
    if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL reported a drawing error");
    return count;
  });
}

async function rememberView(page) {
  await page.locator("canvas").evaluate((canvas) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d");
    context.drawImage(canvas, 0, 0);
    canvas.testReference = context.getImageData(0, 0, copy.width, copy.height).data;
  });
}

function changedPixelFraction(page) {
  return page.locator("canvas").evaluate((canvas) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d");
    context.drawImage(canvas, 0, 0);
    const current = context.getImageData(0, 0, copy.width, copy.height).data;
    let changed = 0;
    for (let i = 0; i < current.length; i += 4) {
      // GPU antialiasing can differ by a few colour levels across redraws.
      if ([0, 1, 2].some((channel) => Math.abs(current[i + channel] - canvas.testReference[i + channel]) > 5)) changed += 1;
    }
    return changed / (current.length / 4);
  });
}

async function recordDrawingGeometry(page) {
  await page.evaluate(() => {
    window.drawingGeometry = { frame: -1, cubes: [] };
    window.drawingFrames = [];
    const box = window.p5.prototype.box;
    window.p5.prototype.box = function (size) {
      if (window.drawingGeometry.frame !== this.frameCount) {
        window.drawingGeometry = { frame: this.frameCount, time: performance.now(), count: Number(document.querySelector("canvas").getAttribute("aria-label").match(/(\d+) cubes/)[1]), cubes: [] };
        window.drawingFrames.push(window.drawingGeometry);
      }
      // Observe the renderer's actual transforms, including the camera and
      // projection, rather than relying on the zoom label or application state.
      window.drawingGeometry.cubes.push({
        size,
        model: [...this._renderer.uModelMatrix.mat4],
        view: [...this._renderer.uViewMatrix.mat4],
        projection: [...this._renderer.uPMatrix.mat4],
      });
      return box.apply(this, arguments);
    };
  });
}

async function drawingAfter(page, action) {
  const previousFrame = await page.evaluate(() => window.drawingGeometry.frame);
  await action();
  // Flush input-triggered redraws; an earlier pending zoom frame may finish
  // while Playwright is still dispatching the keyboard or pointer action.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => page.evaluate(() => window.drawingGeometry.frame)).toBeGreaterThan(previousFrame);
  return page.evaluate(() => window.drawingGeometry.cubes);
}

async function settledDrawing(page) {
  // Verify that drawing actually becomes idle after the transition.
  await page.waitForFunction(() => performance.now() - window.drawingGeometry.time > 120);
  return page.evaluate(() => window.drawingGeometry.cubes);
}

function largestFirst(cubes) {
  return [...cubes].sort((a, b) => b.size - a.size);
}

function expectSameAngleAndCamera(before, after) {
  for (const cube of after) {
    expect(cube.view).toEqual(before.view);
    expect(cube.projection).toEqual(before.projection);
    expect(cube.model.slice(0, 12)).toEqual(before.model.slice(0, 12));
    expect(cube.model[15]).toBe(before.model[15]);
  }
}

function expectScaledAboutSameCentre(before, after, ratio) {
  expectSameAngleAndCamera(before[0], after);
  for (const cube of before.filter((cube) => cube.size * ratio >= 0.251)) {
    const match = after.find((next) => Math.abs(next.size - cube.size * ratio) < 0.0001
      && [12, 13, 14].every((i) => Math.abs(next.model[i] - cube.model[i] * ratio) < 0.001));
    expect(match, "existing cubes scale about the same screen centre").toBeDefined();
  }
}

function expectFitsViewport(cubes) {
  const transform = (matrix, vector) => [0, 1, 2, 3].map((row) =>
    vector.reduce((sum, value, column) => sum + matrix[column * 4 + row] * value, 0));
  for (const cube of cubes) {
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      const world = transform(cube.model, [x * cube.size, y * cube.size, z * cube.size, 1]);
      const eye = transform(cube.view, world);
      const clip = transform(cube.projection, eye);
      expect(Math.abs(clip[0] / clip[3])).toBeLessThan(0.9);
      expect(Math.abs(clip[1] / clip[3])).toBeLessThan(0.9);
    }
  }
}

function expectCount(page, count) {
  return expect(page.locator("canvas")).toHaveAttribute("aria-label", new RegExp(`\\b${count} cubes\\.`));
}

async function cubeCount(page) {
  return Number((await page.locator("canvas").getAttribute("aria-label")).match(/(\d+) cubes/)[1]);
}

async function changeToCount(page, count) {
  // Exercise the real keyboard handler in a burst, including beyond the point
  // where unnormalised Fibonacci values would overflow.
  await page.locator("canvas").evaluate((canvas, target) => {
    const current = Number(canvas.getAttribute("aria-label").match(/(\d+) cubes/)[1]);
    const key = target > current ? "+" : "-";
    for (let i = 0; i < Math.abs(target - current); i += 1) {
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
  }, count);
  await expectCount(page, count);
}

async function animationFramesSince(page, start, count) {
  return page.evaluate(({ start, count }) => window.drawingFrames.slice(start).filter((frame) => frame.count === count), { start, count });
}

function expectSmoothScale(frames, direction) {
  const sizes = frames.map((frame) => Math.max(...frame.cubes.map((cube) => cube.size)));
  expect(sizes.length).toBeGreaterThan(2);
  expect(Math.abs(sizes[0] - sizes.at(-1))).toBeGreaterThan(sizes.at(-1) * 0.05);
  for (let i = 1; i < sizes.length; i += 1) {
    expect((sizes[i] - sizes[i - 1]) * direction).toBeGreaterThanOrEqual(-0.0001);
  }
}

test("adding and removing smoothly reverse scale without panning or rotating across counts", async ({ page }) => {
  await openView(page);
  await recordDrawingGeometry(page);
  const canvas = page.locator("canvas");
  for (const count of [1, 2, 10, 78, 100, 1477]) {
    await changeToCount(page, count);
    await canvas.press("r");
    const before = await drawingAfter(page, () => canvas.press("ArrowRight"));
    const addStart = await page.evaluate(() => window.drawingFrames.length);
    await drawingAfter(page, () => canvas.press("+"));
    const added = await settledDrawing(page);
    await expectCount(page, count + 1);
    expectSmoothScale(await animationFramesSince(page, addStart, count + 1), -1);
    const ratio = largestFirst(added)[1].size / largestFirst(before)[0].size;
    expect(ratio).toBeLessThan(1);
    expectScaledAboutSameCentre(before, added, ratio);
    expectFitsViewport(added);

    const removeStart = await page.evaluate(() => window.drawingFrames.length);
    await drawingAfter(page, () => canvas.press("-"));
    const removed = await settledDrawing(page);
    await expectCount(page, count);
    expectSmoothScale(await animationFramesSince(page, removeStart, count), 1);
    expectScaledAboutSameCentre(before, removed, 1);
    expectFitsViewport(removed);
    expect(await paintedPixels(page)).toBeGreaterThan(500);
  }
});

test("right-click smoothly reverses a left-click and restores the original view", async ({ page }) => {
  await openView(page);
  await recordDrawingGeometry(page);
  const bounds = await page.locator("canvas").boundingBox();
  const x = bounds.width * 0.65;
  const y = bounds.height * 0.35;
  const before = await drawingAfter(page, () => page.mouse.move(x, y));
  await rememberView(page);
  await drawingAfter(page, () => page.mouse.click(x, y));
  await settledDrawing(page);
  await expectCount(page, 11);
  const start = await page.evaluate(() => window.drawingFrames.length);
  await drawingAfter(page, () => page.mouse.click(x, y, { button: "right" }));
  const removed = await settledDrawing(page);
  await expectCount(page, 10);
  expectSmoothScale(await animationFramesSince(page, start, 10), 1);
  expectScaledAboutSameCentre(before, removed, 1);
  expect(await changedPixelFraction(page)).toBeLessThan(0.0001);
});

test("mouse clicks register once while moving, and releases outside the canvas do not add", async ({ page }) => {
  await openView(page);
  const bounds = await page.locator("canvas").boundingBox();
  const x = bounds.width * 0.5;
  const y = bounds.height * 0.5;
  await page.mouse.move(x, y);
  for (const [offset, expected] of [[40, 11], [-40, 12]]) {
    const before = await imageData(page);
    await page.mouse.down();
    await page.mouse.move(x + offset, y + offset, { steps: 4 });
    await expect.poll(() => imageData(page)).not.toBe(before);
    await expectCount(page, expected - 1);
    await page.mouse.up();
    await expectCount(page, expected);
  }
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 20, y - 20, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await expectCount(page, 11);
  await page.mouse.down();
  await page.mouse.move(-10, y, { steps: 4 });
  await page.mouse.up();
  await expectCount(page, 11);
  await page.mouse.click(x, y);
  await expectCount(page, 12);
});

test("holding either mouse button repeats while moving and adds no extra step on release", async ({ page }) => {
  await openView(page);
  await recordDrawingGeometry(page);
  await page.locator("canvas").evaluate((canvas) => {
    window.releases = [];
    const count = () => Number(canvas.getAttribute("aria-label").match(/(\d+) cubes/)[1]);
    canvas.addEventListener("pointerup", () => window.releases.push({ before: count() }), true);
    canvas.addEventListener("pointerup", () => { window.releases.at(-1).after = count(); });
  });
  await drawingAfter(page, () => page.mouse.move(600, 350));
  await page.mouse.down();
  await page.waitForTimeout(80);
  await expectCount(page, 10);
  await page.waitForTimeout(720);
  const held = await cubeCount(page);
  expect(held).toBeGreaterThanOrEqual(15);
  await page.mouse.move(660, 390, { steps: 4 });
  await page.waitForTimeout(200);
  expect(await cubeCount(page)).toBeGreaterThan(held);
  await page.mouse.up();
  const added = await cubeCount(page);
  await page.waitForTimeout(250);
  await expectCount(page, added);
  expectFitsViewport(await settledDrawing(page));

  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(80);
  await expectCount(page, added);
  await page.waitForTimeout(720);
  expect(await cubeCount(page)).toBeLessThanOrEqual(added - 5);
  await page.mouse.move(620, 360, { steps: 4 });
  await page.waitForTimeout(200);
  await page.mouse.up({ button: "right" });
  const removed = await cubeCount(page);
  await page.waitForTimeout(250);
  await expectCount(page, removed);
  expectFitsViewport(await settledDrawing(page));
  const releases = await page.evaluate(() => window.releases);
  expect(releases).toHaveLength(2);
  for (const release of releases) expect(release.after).toBe(release.before);
});

test("leaving the viewport, losing focus, or cancelling capture stops a held button", async ({ page }) => {
  await openView(page);
  const canvas = page.locator("canvas");
  await canvas.evaluate((canvas) => {
    canvas.addEventListener("pointerdown", (event) => { window.heldPointerId = event.pointerId; });
  });
  const cancellations = [
    () => page.mouse.move(-10, 350),
    () => page.evaluate(() => window.dispatchEvent(new Event("blur"))),
    () => canvas.evaluate((canvas) => canvas.releasePointerCapture(window.heldPointerId)),
    () => canvas.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse" }),
  ];
  for (const cancel of cancellations) {
    await page.mouse.move(600, 350);
    const before = await cubeCount(page);
    await page.mouse.down();
    await page.waitForTimeout(450);
    expect(await cubeCount(page)).toBeGreaterThan(before);
    await cancel();
    // Give the browser a frame to deliver lostpointercapture.
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const cancelled = await cubeCount(page);
    await page.waitForTimeout(250);
    await expectCount(page, cancelled);
    await page.mouse.up();
    await expectCount(page, cancelled);
  }
  // A cancelled gesture must not prevent the next ordinary click.
  const before = await cubeCount(page);
  await canvas.click();
  await expectCount(page, before + 1);
});

test("a held right button stops at the minimum and leaves the renderer idle", async ({ page }) => {
  await openView(page);
  await recordDrawingGeometry(page);
  await changeToCount(page, 2);
  await page.locator("canvas").press("r");
  await drawingAfter(page, () => page.mouse.move(600, 350));
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(800);
  await expectCount(page, 1);
  expectFitsViewport(await settledDrawing(page));
  const frame = await page.evaluate(() => window.drawingGeometry.frame);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.drawingGeometry.frame)).toBe(frame);
  await page.mouse.up({ button: "right" });
  await expectCount(page, 1);
  await page.locator("canvas").click();
  await expectCount(page, 2);
});

test("changing direction mid-animation is continuous, and the wheel stops automatic zoom", async ({ page }) => {
  await openView(page);
  await recordDrawingGeometry(page);
  const canvas = page.locator("canvas");
  const initial = await drawingAfter(page, () => canvas.press("ArrowRight"));
  await drawingAfter(page, () => canvas.press("+"));
  let reversingFrom;
  const reversing = await drawingAfter(page, async () => {
    reversingFrom = await page.evaluate(() => {
      const cubes = window.drawingGeometry.cubes;
      document.querySelector("canvas").dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
      return cubes;
    });
  });
  const oldLargest = largestFirst(reversingFrom)[1].size;
  const firstLargest = largestFirst(reversing)[0].size;
  expect(firstLargest).toBeGreaterThanOrEqual(oldLargest);
  expect(firstLargest).toBeLessThan(largestFirst(initial)[0].size);
  expectScaledAboutSameCentre(largestFirst(reversingFrom).slice(1), reversing, firstLargest / oldLargest);
  const reversed = await settledDrawing(page);
  expectScaledAboutSameCentre(initial, reversed, 1);

  await drawingAfter(page, () => canvas.press("+"));
  let beforeWheel;
  const zoomed = await drawingAfter(page, async () => {
    beforeWheel = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const cubes = window.drawingGeometry.cubes;
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
      return cubes;
    });
  });
  expectScaledAboutSameCentre(beforeWheel, zoomed, 1.22);
  expect(await settledDrawing(page)).toEqual(zoomed);
});

test("rapid changes keep only the latest 100 cubes and finite drawing work beyond numeric overflow", async ({ page }) => {
  await openView(page);
  await recordDrawingGeometry(page);
  await page.evaluate(() => {
    const build = FibonacciFractal.build;
    window.retainedWindows = [];
    FibonacciFractal.build = function (count) {
      const scene = build(count);
      window.retainedWindows.push({ count, length: scene.cubes.length, first: scene.firstIndex, last: scene.lastIndex });
      return scene;
    };
  });
  for (const count of [99, 100, 101, 100, 99, 1477, 10, 1]) {
    await drawingAfter(page, () => changeToCount(page, count));
    const fitted = await settledDrawing(page);
    expectFitsViewport(fitted);
    expect(await paintedPixels(page)).toBeGreaterThan(500);
    await expect(page.locator("canvas")).toHaveAttribute("aria-label", new RegExp(`Latest ${Math.min(count, 100)} shown`));
  }
  const windows = await page.evaluate(() => window.retainedWindows);
  for (const window of windows) {
    expect(window.length).toBe(Math.min(window.count, 100));
    expect(window.first).toBe(Math.max(1, window.count - 99));
    expect(window.last).toBe(window.count);
  }
  const frames = await page.evaluate(() => window.drawingFrames);
  for (const frame of frames) {
    expect(frame.cubes.length).toBeLessThanOrEqual(100);
    expect(frame.cubes.every((cube) => [cube.size, ...cube.model, ...cube.view, ...cube.projection].every(Number.isFinite))).toBe(true);
  }
  await page.locator("canvas").press("-");
  await expectCount(page, 1);
});

test("the dark canvas fills the window with no surrounding interface at desktop and mobile sizes", async ({ page }, testInfo) => {
  await openView(page);
  await expect(page.locator("header, aside, footer, button, input, form, details")).toHaveCount(0);
  expect(await page.locator("body").innerText()).toBe("");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  for (const [width, height] of [[1440, 1000], [1100, 844], [760, 844], [390, 844], [320, 844]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.locator("canvas").boundingBox()).toEqual({ x: 0, y: 0, width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight)).toBe(true);
    expect(await paintedPixels(page)).toBeGreaterThan(500);
    if (width === 1440 || width === 320) await page.screenshot({ path: testInfo.outputPath(`viewport-${width}.png`) });
  }
});

test("wheel zoom, wireframe, keyboard rotation, and reset remain available without controls", async ({ page }, testInfo) => {
  await openView(page);
  await recordDrawingGeometry(page);
  const canvas = page.locator("canvas");
  await canvas.click();
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveCSS("outline-style", "none");
  await expectCount(page, 11);
  await page.screenshot({ path: testInfo.outputPath("first-click.png") });
  await canvas.click({ button: "right" });
  await expectCount(page, 10);
  await drawingAfter(page, () => canvas.press("r"));
  await expect(canvas).toHaveCSS("outline-style", "none");
  await rememberView(page);
  const filled = await paintedPixels(page);
  await canvas.press("w");
  await expect(canvas).toHaveAttribute("aria-label", /Wireframe/);
  await expect.poll(() => paintedPixels(page)).toBeLessThan(filled / 2);
  await page.screenshot({ path: testInfo.outputPath("wireframe.png") });
  await canvas.press("w");
  await expect(canvas).toHaveAttribute("aria-label", /Filled/);
  await canvas.dispatchEvent("wheel", { deltaY: -100, deltaMode: 0 });
  await expect(canvas).toHaveAttribute("aria-label", /Zoom 122%/);
  for (const [deltaY, zoom] of [[-100, 300], [100, 25]]) {
    for (let i = 0; i < 20; i += 1) await canvas.dispatchEvent("wheel", { deltaY, deltaMode: 0 });
    await expect(canvas).toHaveAttribute("aria-label", new RegExp(`Zoom ${zoom}%`));
  }
  await canvas.press("ArrowRight");
  expect(await changedPixelFraction(page)).toBeGreaterThan(0.01);
  await drawingAfter(page, () => canvas.press("r"));
  await expect(canvas).toHaveAttribute("aria-label", /Zoom 100%/);
  expect(await changedPixelFraction(page)).toBeLessThan(0.0001);
});

test("reduced motion fits both additions and removals without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openView(page);
  await recordDrawingGeometry(page);
  const canvas = page.locator("canvas");
  const before = await drawingAfter(page, () => canvas.press("ArrowRight"));
  for (const key of ["+", "-"]) {
    const start = await page.evaluate(() => window.drawingFrames.length);
    const changed = await drawingAfter(page, () => canvas.press(key));
    expect(await settledDrawing(page)).toEqual(changed);
    expectSameAngleAndCamera(before[0], changed);
    expectFitsViewport(changed);
    expect(await page.evaluate((start) => window.drawingFrames.length - start, start)).toBe(1);
  }
  expectScaledAboutSameCentre(before, await settledDrawing(page), 1);
});

test("opens directly from disk without a server or network", async ({ page, context }) => {
  await context.setOffline(true);
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await openView(page, pathToFileURL(path.resolve(__dirname, "../index.html")).href);
  await page.locator("canvas").press("+");
  await expectCount(page, 11);
  await page.locator("canvas").press("-");
  await expectCount(page, 10);
  expect(requests.some((url) => /^https?:/.test(url))).toBe(false);
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  test("tap adds a cube and dragging rotates without adding", async ({ page, context }) => {
    await openView(page);
    await recordDrawingGeometry(page);
    const canvas = page.locator("canvas");
    await drawingAfter(page, () => canvas.tap());
    await expectCount(page, 11);
    const before = await settledDrawing(page);
    const session = await context.newCDPSession(page);
    const dragged = await drawingAfter(page, async () => {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 80, y: 80 }] });
      await page.waitForTimeout(500);
      await expectCount(page, 11);
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 140, y: 120 }] });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    });
    await session.detach();
    expect(dragged[0].model.slice(0, 12)).not.toEqual(before[0].model.slice(0, 12));
    await expectCount(page, 11);
  });
});

test("explains missing WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.includes("webgl") ? null : getContext.call(this, type, ...args);
    };
  });
  await page.goto("/");
  await expect(page.locator("#render-status")).toContainText("needs WebGL");
  await expect(page.locator("#viewport")).toHaveAttribute("aria-busy", "false");
});

test("explains a missing renderer instead of leaving a loading message", async ({ page }) => {
  await page.route("**/vendor/p5.min.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#render-status")).toContainText("renderer could not load");
});

test("local server only serves the browser app", async ({ request }) => {
  expect((await request.get("/vendor/p5.min.js")).headers()["content-type"]).toContain("javascript");
  expect((await request.get("/.git/config")).status()).toBe(404);
  expect((await request.post("/")).status()).toBe(405);
});
