const test = require("node:test");
const assert = require("node:assert/strict");
const { build, cubeAt, MIN_CUBES, MAX_COUNT, VISIBLE_CUBES } = require("../fractal.js");

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

// Independent exact-integer version of the original Processing loop. Doubled
// coordinates avoid fractions. Only the final comparison uses floating point.
function originalSketch(count) {
  const cubes = [];
  let previous = 0n;
  let beforePrevious = 0n;
  let x = 0n;
  let y = 0n;
  for (let index = 1; index <= count; index += 1) {
    const size = index < 3 ? 1n : previous + beforePrevious;
    if (index > 1) {
      if (index % 4 === 0) { x -= 2n * previous + beforePrevious; y += beforePrevious; }
      if (index % 4 === 1) { x += beforePrevious; y += 2n * previous + beforePrevious; }
      if (index % 4 === 2) { x += 2n * previous + beforePrevious; y -= beforePrevious; }
      if (index % 4 === 3) { x -= beforePrevious; y -= 2n * previous + beforePrevious; }
    }
    cubes.push({ index, size, x, y });
    beforePrevious = previous;
    previous = size;
  }
  const window = cubes.slice(-VISIBLE_CUBES);
  const largest = Number(previous);
  return window.map((cube) => ({
    index: cube.index,
    size: Number(cube.size) / largest,
    x: Number(5n * cube.x - 1n) / 10 / largest,
    y: Number(5n * cube.y + 3n) / 10 / largest,
    z: -Number(cube.size) / 2 / largest,
  }));
}

test("preserves the first ten original placements, with the largest side normalised to 1", () => {
  const positions = [[0, 0], [1, 0], [0.5, -1.5], [-2, -1], [-1, 3], [5.5, 1.5], [3, -9], [-14, -5], [-7.5, 22.5], [37, 12]];
  const sizes = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
  const { cubes } = build(10);
  cubes.forEach((cube, i) => {
    assert.equal(cube.index, i + 1);
    close(cube.size, sizes[i] / 55);
    close(cube.x, (positions[i][0] - 0.1) / 55);
    close(cube.y, (positions[i][1] + 0.3) / 55);
    close(cube.z, -sizes[i] / 110);
  });
});

test("matches exact original geometry through rolling-window and numerical-method boundaries", () => {
  for (const count of [1, 2, 3, 10, 32, 78, 79, 99, 100, 101, 102, 103, 104, 1000]) {
    const { cubes } = build(count);
    const reference = originalSketch(count);
    assert.equal(cubes.length, reference.length);
    cubes.forEach((cube, i) => {
      assert.equal(cube.index, reference[i].index);
      close(cube.size, reference[i].size, reference[i].size * 1e-12);
      for (const axis of ["x", "y", "z"]) close(cube[axis], reference[i][axis]);
    });
  }
});

test("the initial sequence tiles a rectangle without overlapping cube interiors", () => {
  for (let count = MIN_CUBES; count <= VISIBLE_CUBES; count += 1) {
    const { cubes } = build(count);
    const left = Math.min(...cubes.map((cube) => cube.x - cube.size / 2));
    const right = Math.max(...cubes.map((cube) => cube.x + cube.size / 2));
    const top = Math.min(...cubes.map((cube) => cube.y - cube.size / 2));
    const bottom = Math.max(...cubes.map((cube) => cube.y + cube.size / 2));
    close(cubes.reduce((area, cube) => area + cube.size ** 2, 0), (right - left) * (bottom - top));
    for (let i = 0; i < cubes.length; i += 1) {
      const a = cubes[i];
      assert.equal(a.z + a.size / 2, 0, "front faces share a plane");
      for (const b of cubes.slice(i + 1)) {
        const halfSum = (a.size + b.size) / 2;
        const tolerance = Math.max(a.size, b.size) * 1e-12;
        assert.ok(Math.abs(a.x - b.x) >= halfSum - tolerance || Math.abs(a.y - b.y) >= halfSum - tolerance, `cubes overlap at count ${count}`);
      }
    }
  }
});

test("keeps only the latest 100 cubes and finite fit bounds, far beyond Fibonacci overflow", () => {
  for (const count of [1, 32, 99, 100, 101, 1477, 10000, 1_000_000, 1_000_000_000, 1_000_000_000_000, MAX_COUNT - 3, MAX_COUNT - 2, MAX_COUNT - 1, MAX_COUNT]) {
    const { cubes, center, radius, firstIndex, lastIndex } = build(count);
    assert.equal(cubes.length, Math.min(count, VISIBLE_CUBES));
    assert.equal(firstIndex, Math.max(1, count - VISIBLE_CUBES + 1));
    assert.equal(lastIndex, count);
    assert.equal(cubes.at(-1).size, 1);
    assert.ok(Number.isFinite(radius) && radius > 0 && radius < 2);
    cubes.forEach((cube, i) => {
      assert.equal(cube.index, firstIndex + i);
      assert.ok(cube.size > 0 && cube.size <= 1);
      for (const value of Object.values(cube)) assert.ok(Number.isFinite(value));
      for (const dx of [-0.5, 0.5]) {
        for (const dy of [-0.5, 0.5]) {
          for (const dz of [-0.5, 0.5]) {
            const distance = Math.hypot(cube.x + dx * cube.size - center.x, cube.y + dy * cube.size - center.y, cube.z + dz * cube.size - center.z);
            assert.ok(distance <= radius + 1e-12);
          }
        }
      }
    });
  }
});

test("removal restores older cubes after crossing the rolling-window boundary", () => {
  assert.equal(build(101).cubes[0].index, 2);
  assert.equal(build(100).cubes[0].index, 1);
  assert.equal(build(99).cubes[0].index, 1);
  assert.equal(build(99).cubes.length, 99);
});

test("a fixed viewing frame preserves original cube sizes and positions as the window changes", () => {
  for (const count of [10, 78, 100, 101, 1000]) {
    const before = originalSketch(count);
    for (const nextCount of [count - 1, count + 1]) {
      const next = originalSketch(nextCount);
      const sharedIndex = Math.min(count, nextCount);
      const ratio = before.find((cube) => cube.index === sharedIndex).size
        / next.find((cube) => cube.index === sharedIndex).size;
      for (const cube of next) {
        const actual = cubeAt(cube.index, count);
        for (const key of ["x", "y", "z", "size"]) close(actual[key], cube[key] * ratio);
      }
    }
  }
  const previous = cubeAt(10, 10);
  const added = cubeAt(11, 10);
  close(added.size, 89 / 55);
  close(added.x - previous.x, -34 / 2 / 55);
  close(added.y - previous.y, -(55 + 34 / 2) / 55);
});

test("extreme jumps stay representable after resetting the viewing frame", () => {
  assert.equal(cubeAt(10000, 10), null);
  assert.equal(cubeAt(10, 10000), null);
  assert.equal(cubeAt(MAX_COUNT, 10), null);
  assert.equal(cubeAt(MAX_COUNT, MAX_COUNT).size, 1);
  assert.equal(cubeAt(10, 10).size, 1);
});

test("rejects counts that cannot be incremented exactly", () => {
  for (const count of [0, -1, MAX_COUNT + 1, 1.5, NaN, Infinity, "10", undefined]) {
    assert.throws(() => build(count), RangeError);
  }
});
