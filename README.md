# Fibonacci Fractal

A full-window 3D Fibonacci fractal on a dark canvas. Click to add cubes and zoom
out; right-click to remove cubes and zoom in. Only the latest 100 cubes are kept.

[Open the animation](https://stevenblair.github.io/fibonaccifractal/).

## Run in a browser

Open **index.html** in a current browser with WebGL enabled. Keep the other files
and the `vendor` directory beside it. No installation, build step, server, or
internet connection is needed.

To use a local URL instead, install Node.js 22 or newer and run:

```sh
npm start
```

Then open <http://127.0.0.1:8000>. You do not need to run `npm install` to start the
server. Stop it with Ctrl+C. Set `PORT` to use a different port. The server binds
only to this computer and serves only the browser app files.

## Controls

| Action | Mouse or touch | Keyboard, with the view focused |
| --- | --- | --- |
| Rotate | Move the mouse over the view; drag on a touchscreen | Arrow keys |
| Add a cube and zoom out | Click or tap | + |
| Remove a cube and zoom in | Right-click | − |
| Add or remove repeatedly | Hold the left or right mouse button | Hold + or − |
| Zoom manually | Scroll | — |
| Switch filled/wireframe | — | W |
| Reset rotation and zoom | — | R |

Click or Tab to focus the canvas for keyboard input. Mouse clicks register while
moving; touch drags rotate without adding cubes. Holding either mouse button
starts repeating after 300 ms, at about 12 cubes per second. Releasing the button,
leaving the canvas, or losing focus stops repetition. Both adding and removing animate
the scale around the spiral's fixed centre, preserving rotation. Reversing
direction during an animation continues from the displayed scale. Scrolling
stops the automatic animation and adjusts zoom. Reduced-motion preferences skip
the animation.

## Browser port

The original `FibonacciFractal.pde` is preserved. It uses Processing's Java `P3D`
renderer and an AWT mouse-wheel listener, so it cannot run directly in a browser.
The browser version uses a local copy of p5.js 1.11.13 and WebGL.

`fractal.js` preserves the Fibonacci size ratios, four-direction placement,
and shared front plane. `sketch.js` handles the renderer and interactions.
`index.html` and `styles.css` make the canvas fill the browser window.

The initial view shows 10 cubes. Keep clicking to extend the sequence.
Only the latest 100 cubes are retained; removing cubes reconstructs the earlier
window. The practical count limit is JavaScript's largest exactly incrementable
integer, 9,007,199,254,740,991.

Coordinates are normalised to the newest cube's side length and calculated
directly, without generating the whole sequence. Adding or removing a cube
converts the displayed scale into the new units before animating to the fitted
scale. The spiral's fixed origin stays at the centre of the viewport.
Each update constructs at most 100 cubes, independent of the total count.
Geometry outside the camera's clipping range and boxes smaller than a quarter
of a screen pixel are skipped when drawing.

A bounding sphere fits the geometry at every angle. Zoom transitions take 420 ms,
or 160 ms while holding a mouse button, and are bounded to keep rapid sequences
of inputs within floating-point range.
The narrow perspective is retained with an explicitly positioned camera.
The view redraws only on input, resize, or during the short zoom animation.

## Verify

Node.js 22 or newer is required for the test tools:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

To test with an installed Chrome or Edge instead of downloading Chromium, set
`PLAYWRIGHT_CHANNEL` to `chrome` or `msedge`. For example, in PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:browser
```

The geometry tests check original placements against an exact-integer reference,
tiling, rolling-window boundaries, and finite geometry up to the count limit.
The browser tests check dark mode, rendered pixels, large counts, bounded draw
work, reversible zoom with a stable viewing angle and centre, mouse and keyboard
input, full-window sizing down to 320px, touch input, offline file loading, and
renderer failure messages. Tests start their own server on a temporary port.
Screenshots are saved in `test-results/`.

## GitHub Pages

GitHub Pages publishes the repository root from `master`. Pushing to that branch
updates the site. The `.nojekyll` file makes Pages serve the static files directly.

## License

The original sketch and browser application are MIT-licensed; see `LICENSE`.
p5.js is distributed separately under its LGPL license; see `vendor/README.md`
and `vendor/p5.LICENSE.txt` for provenance and license text.
