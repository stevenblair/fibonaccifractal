// Optional local server. The page also works by opening index.html directly.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/fractal.js", ["fractal.js", "text/javascript"]],
  ["/sketch.js", ["sketch.js", "text/javascript"]],
  ["/vendor/p5.min.js", ["vendor/p5.min.js", "text/javascript"]],
]);
function createServer() {
  return http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const file = files.get(request.url.split("?")[0]);
    if (!file) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    fs.readFile(path.join(root, file[0]), (error, body) => {
      if (error) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Could not read the requested file");
        return;
      }
      response.writeHead(200, { "Content-Type": `${file[1]}; charset=utf-8`, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : body);
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be an integer from 1 to 65535.");
    process.exit(1);
  }
  createServer().on("error", (error) => {
    console.error(`Could not start the local server: ${error.message}`);
    process.exitCode = 1;
  }).listen(port, "127.0.0.1", () => {
    console.log(`Fibonacci Fractal: http://127.0.0.1:${port}`);
  });
}
