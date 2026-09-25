# p5.js

`p5.min.js` is the unmodified browser build from the `p5@1.11.13` npm package.
It is kept locally so opening `index.html` does not need a CDN or an internet
connection. The application uses p5's WebGL renderer; no sound add-on is used.

- Project and source: https://github.com/processing/p5.js/tree/v1.11.13
- Package: https://www.npmjs.com/package/p5/v/1.11.13
- Archive: https://registry.npmjs.org/p5/-/p5-1.11.13.tgz
- Archive SHA-1 (npm shasum): `1ee9fb1c79c0d97800f7ec6f7ebdaec8d73b1a17`
- `p5.min.js` SHA-256: `e9df7d05fd7c3ff028fc09a312a43101241f23c43143b387bf89d96b2e4e0849`
- License: LGPL-2.1; the package's full license is in `p5.LICENSE.txt`.

To update, obtain a pinned p5 1.x package, copy `lib/p5.min.js` and `license.txt`
from its archive, update this provenance, and rerun the browser tests. Application
code and the library are separate files, so the library can be replaced without
rebuilding the application.
