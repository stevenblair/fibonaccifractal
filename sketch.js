/* Browser view of FibonacciFractal.pde. MIT license; see LICENSE. */
"use strict";

(() => {
  const viewport = document.getElementById("viewport");
  const status = document.getElementById("render-status");
  const defaultPitch = -0.45;
  const defaultYaw = -0.55;
  let count = 10;
  let scene = FibonacciFractal.build(count);
  let viewFrame = { count, radius: fitRadius(scene) };
  let fitAnimation = null;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const fitDuration = 420;
  const holdDelay = 300;
  const repeatInterval = 80;
  let zoom = 1;
  let pitch = defaultPitch;
  let yaw = defaultYaw;
  let wireframe = false;
  let ready = false;
  let pending = false;
  let pointer = null;
  let repeatTimer = null;
  let canvas = null;

  function stopPointer() {
    clearTimeout(repeatTimer);
    repeatTimer = null;
    pointer = null;
  }

  function fitRadius(model) {
    // Keep the spiral's fixed origin at the centre at every scale, including
    // when removing cubes below the initial count.
    return Math.max(...model.cubes.map((cube) => Math.hypot(
      ...["x", "y", "z"].map((axis) => Math.abs(cube[axis]) + cube.size / 2)
    )));
  }

  function showError(message) {
    ready = false;
    stopPointer();
    status.textContent = message;
    status.hidden = false;
    viewport.setAttribute("aria-busy", "false");
  }

  if (typeof p5 === "undefined") {
    showError("The renderer could not load. Keep the vendor folder beside index.html, then reload the page.");
    return;
  }

  new p5((p) => {
    function render() {
      if (!ready || pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (ready) p.redraw();
      });
    }

    function describeView() {
      canvas.setAttribute("aria-label", `Fibonacci fractal. ${count} cubes. Latest ${scene.cubes.length} shown. ${wireframe ? "Wireframe" : "Filled"}. Zoom ${Math.round(zoom * 100)}%.`);
    }

    function changeCount(value, duration = fitDuration) {
      if (!Number.isSafeInteger(value) || value < FibonacciFractal.MIN_CUBES) return false;
      if (count !== value) {
        count = value;
        scene = FibonacciFractal.build(count);
        fitCount(duration);
      }
      describeView();
      render();
      return true;
    }

    function fitCount(duration) {
      // Rebase the last displayed scale into the new cube's units before
      // animating. Reversing direction never jumps or resets angles.
      const ratio = FibonacciFractal.cubeAt(viewFrame.count, count)?.size || 0;
      const requiredRadius = fitRadius(scene);
      const currentRadius = viewFrame.radius * ratio;
      // Bound the accumulated scale if many inputs arrive before a frame draws.
      const startRadius = Math.max(requiredRadius / 1_000_000,
        Math.min(requiredRadius * 1_000_000, currentRadius));
      viewFrame = { count, radius: startRadius };
      if (reducedMotion.matches || startRadius === requiredRadius) {
        viewFrame.radius = requiredRadius;
        fitAnimation = null;
      } else {
        fitAnimation = { startRadius, targetRadius: requiredRadius, startTime: performance.now(), duration };
      }
    }

    function advanceFit() {
      if (!fitAnimation) return;
      const progress = reducedMotion.matches ? 1 : Math.min(1, (performance.now() - fitAnimation.startTime) / fitAnimation.duration);
      const eased = 1 - (1 - progress) ** 3;
      // Interpolate magnification rather than world distance for an even zoom
      // across Fibonacci scales. Retarget from the last drawn scale on input.
      viewFrame.radius = fitAnimation.startRadius
        * (fitAnimation.targetRadius / fitAnimation.startRadius) ** eased;
      if (progress === 1) {
        viewFrame.radius = fitAnimation.targetRadius;
        fitAnimation = null;
      }
    }

    function changeZoom(value) {
      if (!Number.isFinite(value)) return;
      fitAnimation = null;
      zoom = Math.round(Math.max(0.25, Math.min(3, value)) * 100) / 100;
      describeView();
      render();
    }

    function resetView() {
      fitAnimation = null;
      viewFrame = { count, radius: fitRadius(scene) };
      pitch = defaultPitch;
      yaw = defaultYaw;
      zoom = 1;
      describeView();
      render();
    }

    function setWireframe(value) {
      wireframe = value;
      describeView();
      render();
    }

    function insideCanvas(event) {
      const bounds = canvas.getBoundingClientRect();
      return event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    }

    function repeatPointer() {
      repeatTimer = null;
      if (!ready || !pointer || document.hidden || !canvas.hasPointerCapture(pointer.id)) {
        stopPointer();
        return;
      }
      pointer.repeated = true;
      // Shorter transitions keep the zoom following the repeated changes.
      if (changeCount(count + pointer.direction, repeatInterval * 2)) {
        repeatTimer = setTimeout(repeatPointer, repeatInterval);
      }
    }

    function connectControls() {
      canvas.addEventListener("pointerdown", (event) => {
        const mouse = event.pointerType === "mouse";
        if (!ready || pointer || (event.button !== 0 && !(mouse && event.button === 2))) return;
        canvas.focus({ preventScroll: true });
        pointer = {
          id: event.pointerId, x: event.clientX, y: event.clientY, pitch, yaw,
          direction: event.button === 2 ? -1 : 1,
          buttonMask: event.button === 2 ? 2 : 1,
          moved: false, repeated: false,
        };
        canvas.setPointerCapture(event.pointerId);
        if (mouse) repeatTimer = setTimeout(repeatPointer, holdDelay);
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!ready) return;
        const bounds = canvas.getBoundingClientRect();
        if (pointer && pointer.id === event.pointerId && event.pointerType === "mouse"
            && (!(event.buttons & pointer.buttonMask) || !insideCanvas(event))) {
          stopPointer();
        }
        // Mouse movement rotates even during a click. Only touch and pen
        // drags need to suppress adding a cube when the pointer is released.
        if (pointer && pointer.id === event.pointerId && event.pointerType !== "mouse") {
          const dx = event.clientX - pointer.x;
          const dy = event.clientY - pointer.y;
          pointer.moved ||= Math.hypot(dx, dy) > 6;
          yaw = pointer.yaw + dx / bounds.width * Math.PI;
          pitch = pointer.pitch + dy / bounds.height * Math.PI;
        }
        if (event.pointerType === "mouse") {
          // Like the original sketch, mouse position controls the two angles.
          yaw = ((event.clientX - bounds.left) / bounds.width - 0.5) * Math.PI;
          pitch = ((event.clientY - bounds.top) / bounds.height - 0.5) * Math.PI;
        }
        render();
      });
      canvas.addEventListener("pointerup", (event) => {
        if (!pointer || pointer.id !== event.pointerId) return;
        const finished = pointer;
        stopPointer();
        if (ready && insideCanvas(event) && !finished.moved && !finished.repeated) {
          changeCount(count + finished.direction);
        }
      });
      canvas.addEventListener("lostpointercapture", stopPointer);
      canvas.addEventListener("pointercancel", stopPointer);
      canvas.addEventListener("blur", stopPointer);
      window.addEventListener("blur", stopPointer);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopPointer();
      });
      // Right-button actions use the same pointer lifecycle as left clicks.
      // The contextmenu event can arrive on either press or release by browser.
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
      canvas.addEventListener("wheel", (event) => {
        if (!ready || event.ctrlKey || event.metaKey || event.deltaY === 0) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? p.height : 1;
        const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
        changeZoom(zoom * Math.exp(-delta * 0.002));
      }, { passive: false });
      canvas.addEventListener("keydown", (event) => {
        if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
        switch (event.key.toLowerCase()) {
          case "+": case "=": changeCount(count + 1); break;
          case "-": case "_": changeCount(count - 1); break;
          case "w": setWireframe(!wireframe); break;
          case "r": resetView(); break;
          case "arrowleft": yaw -= 0.1; break;
          case "arrowright": yaw += 0.1; break;
          case "arrowup": pitch -= 0.1; break;
          case "arrowdown": pitch += 0.1; break;
          default: return;
        }
        event.preventDefault();
        render();
      });
    }

    p.setup = () => {
      try {
        p.setAttributes({ antialias: true, alpha: false });
        p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
        canvas = p.createCanvas(viewport.clientWidth, viewport.clientHeight, p.WEBGL).elt;
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-description", "Move the mouse or drag to rotate. Click or tap to add a cube; right-click to remove. Hold either mouse button to repeat. Scroll to zoom. Arrow keys rotate, plus and minus change the cube count, W switches display, and R resets the view.");
        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          showError("The 3D view was interrupted. Reload the page to restart it.");
        });
        p.noLoop();
        connectControls();
        ready = true;
        status.hidden = true;
        viewport.setAttribute("aria-busy", "false");
        describeView();
        new ResizeObserver(() => {
          if (!ready) return;
          const width = viewport.clientWidth;
          const height = viewport.clientHeight;
          if (width > 0 && height > 0 && (width !== p.width || height !== p.height)) {
            p.resizeCanvas(width, height, true);
            render();
          }
        }).observe(viewport);
      } catch (error) {
        p.noLoop();
        showError("The 3D view needs WebGL. Enable graphics acceleration in your browser, then reload the page.");
        console.error(error);
      }
    };

    p.draw = () => {
      if (!ready) return;
      advanceFit();
      p.background(19, 28, 24);
      // Keep the original narrow field of view, with an explicit matching camera.
      const fov = 0.025;
      const cameraZ = (p.height / 2) / Math.tan(fov / 2);
      p.camera(0, 0, cameraZ, 0, 0, 0, 0, 1, 0);
      p.perspective(fov, p.width / p.height, cameraZ / 10, cameraZ * 10);
      p.ambientLight(150);
      p.directionalLight(255, 250, 240, 0.3, 0.5, -1);
      p.rotateY(yaw);
      p.rotateX(pitch);

      const scale = Math.min(p.width, p.height) * 0.4 / viewFrame.radius * zoom;
      if (wireframe) {
        p.noFill();
        p.stroke(143, 210, 167);
        p.strokeWeight(1.2);
      } else {
        p.fill(111, 177, 136, 125);
        p.stroke(143, 210, 167, 170);
        p.strokeWeight(0.7);
      }

      // Draw transparent cubes from back to front for the current rotation.
      const depth = (cube) => -Math.sin(yaw) * cube.x
        + Math.cos(yaw) * (Math.sin(pitch) * cube.y + Math.cos(pitch) * cube.z);
      // Enclose the camera frustum in a sphere. Cull distant boxes before
      // submitting coordinates to WebGL, keeping a fixed view safe at any count.
      const clipRadius = Math.hypot(5 * p.width, 5 * p.height, 9 * cameraZ) / scale;
      const cubes = scene.cubes
        .filter((cube) => {
          if (!cube || cube.size * scale < 0.25) return false;
          const distance = Math.hypot(...["x", "y", "z"].map((axis) =>
            Math.max(0, Math.abs(cube[axis]) - cube.size / 2)));
          return distance <= clipRadius;
        })
        .sort((a, b) => depth(a) - depth(b));
      // All faces are translucent (or empty). Shared cube faces are coplanar,
      // so depth-testing them causes flicker; blend them in the sorted order.
      const gl = p.drawingContext;
      gl.disable(gl.DEPTH_TEST);
      for (const cube of cubes) {
        p.push();
        p.translate(cube.x * scale, cube.y * scale, cube.z * scale);
        p.box(cube.size * scale);
        p.pop();
      }
      gl.enable(gl.DEPTH_TEST);
      if (fitAnimation) render();
    };
  }, viewport);
})();
