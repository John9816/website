const http = require("http");
const https = require("https");
const { URL } = require("url");
const fs = require("fs");
const TARGET = "https://fufu.iqach.top";
const PORT = 18787;
const log = (m) => { try { fs.appendFileSync(__dirname + "/mimo-proxy.out.log", new Date().toISOString()+" "+m+"\n"); } catch(e){} console.log(m); };
const server = http.createServer((req, res) => {
  const started = Date.now();
  log(req.method+" "+req.url);
  const target = new URL(req.url || "/", TARGET);
  const headers = Object.assign({}, req.headers, { host: target.host });
  delete headers["content-length"];
  const opts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers: headers,
    timeout: 0,
  };
  const upstream = https.request(opts, (up) => {
    log("up status="+up.statusCode+" t="+(Date.now()-started));
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
    up.on("end", () => log("up end t="+(Date.now()-started)));
  });
  upstream.setTimeout(0);
  upstream.on("timeout", () => {
    log("timeout t="+(Date.now()-started));
    upstream.destroy();
    if (!res.headersSent) res.writeHead(504);
    res.end("upstream timeout");
  });
  upstream.on("error", (err) => {
    log("error "+err.message);
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: String(err.message || err) } }));
  });
  req.pipe(upstream);
});
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
server.keepAliveTimeout = 120000;
server.listen(PORT, "127.0.0.1", () => log("listening "+PORT));
process.on("uncaughtException", (e) => log("uncaught "+e.stack));
process.on("unhandledRejection", (e) => log("unhandled "+e));