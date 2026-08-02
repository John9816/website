const http = require("http");
const https = require("https");
const { URL } = require("url");
const TARGET = "https://fufu.iqach.top";
const PORT = 18787;
const server = http.createServer((req, res) => {
  const target = new URL(req.url || "/", TARGET);
  const headers = { ...req.headers, host: target.host };
  delete headers["content-length"];
  const opts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || 443,
    path: target.pathname + target.search,
    method: req.method,
    headers,
    timeout: 180000,
  };
  const upstream = https.request(opts, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on("timeout", () => {
    upstream.destroy();
    if (!res.headersSent) res.writeHead(504);
    res.end("upstream timeout");
  });
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: String(err.message || err) } }));
  });
  req.pipe(upstream);
});
server.listen(PORT, "127.0.0.1", () => console.log("mimo-proxy listening on", PORT));
