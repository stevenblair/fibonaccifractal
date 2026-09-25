/* Fibonacci cube geometry, ported from FibonacciFractal.pde.
 * Copyright (c) 2011 Steven Blair. MIT license; see LICENSE.
 */
"use strict";

const FibonacciFractal = (() => {
  const MIN_CUBES = 1;
  const MAX_COUNT = Number.MAX_SAFE_INTEGER;
  const VISIBLE_CUBES = 100;
  const GOLDEN = (1 + Math.sqrt(5)) / 2;
  const CONJUGATE_RATIO = -1 / (GOLDEN * GOLDEN);
  // F(78) is the last Fibonacci integer that JavaScript represents exactly.
  const exact = [0, 1];
  for (let i = 2; i <= 78; i += 1) exact.push(exact[i - 1] + exact[i - 2]);

  function validateCount(count) {
    if (!Number.isSafeInteger(count) || count < MIN_CUBES) {
      throw new RangeError(`Cube count must be a whole number from ${MIN_CUBES} to ${MAX_COUNT}.`);
    }
  }

  function relativeSize(index, count) {
    if (index < 1) return 0;
    if (index < exact.length && count < exact.length) return exact[index] / exact[count];
    // Divide Binet's formula before evaluating it: the exponent is only the
    // distance within the visible window, never the (possibly huge) count.
    return GOLDEN ** (index - count)
      * (1 - CONJUGATE_RATIO ** index) / (1 - CONJUGATE_RATIO ** count);
  }

  function cubeAt(index, scaleIndex) {
    validateCount(index);
    validateCount(scaleIndex);
    const size = relativeSize(index, scaleIndex);
    // A fixed view can be thousands of terms away from the retained window.
    // Such cubes are outside its numerical range; refitting brings them back.
    if (!Number.isFinite(size) || size === 0) return null;

    // The original cumulative XY translations have the closed form
    // C(n) = (0.1, -0.3) - rotateClockwise(n - 1, (0.1, -0.3)) * L(n),
    // where L(n) = F(n) + 2 F(n - 1). Use the fixed point (0.1, -0.3)
    // as the origin so dropping an old cube never moves the remaining ones.
    const extent = 1 + 2 * relativeSize(index - 1, index);
    let x = -0.1 * extent * size;
    let y = 0.3 * extent * size;
    switch ((index - 1) % 4) {
      case 1: [x, y] = [y, -x]; break;
      case 2: [x, y] = [-x, -y]; break;
      case 3: [x, y] = [-y, x]; break;
    }
    return { index, size, x, y, z: -size / 2 };
  }

  function build(count) {
    validateCount(count);

    const firstIndex = Math.max(1, count - VISIBLE_CUBES + 1);
    const visibleCount = Math.min(count, VISIBLE_CUBES);
    const cubes = [];
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let offset = 0; offset < visibleCount; offset += 1) {
      const index = firstIndex + offset;
      const cube = cubeAt(index, count);
      cubes.push(cube);
      for (const axis of ["x", "y", "z"]) {
        min[axis] = Math.min(min[axis], cube[axis] - cube.size / 2);
        max[axis] = Math.max(max[axis], cube[axis] + cube.size / 2);
      }
    }

    const center = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };
    // A bounding sphere keeps the whole model in view at every rotation.
    const radius = Math.hypot(max.x - center.x, max.y - center.y, max.z - center.z);
    return { cubes, center, radius, firstIndex, lastIndex: count };
  }

  return { MIN_CUBES, MAX_COUNT, VISIBLE_CUBES, build, cubeAt };
})();

// Classic browser scripts also work when index.html is opened directly from disk.
if (typeof module !== "undefined" && module.exports) {
  module.exports = FibonacciFractal;
}
