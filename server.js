const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const ALLOW_HOSTS = new Set([
  "forex-data-feed.swissquote.com",
  "gold.tanaka.co.jp",
]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function isAllowed(targetUrl) {
  try {
    const { hostname, protocol } = new URL(targetUrl);
    return (protocol === "https:" || protocol === "http:") && ALLOW_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function handleProxy(req, res, target) {
  if (!isAllowed(target)) {
    return sendJson(res, 400, { error: "target not allowed" });
  }
  const urlObj = new URL(target);
  const client = urlObj.protocol === "https:" ? https : http;

  const proxyReq = client.request(
    urlObj,
    {
      method: "GET",
      headers: {
        "User-Agent": "simple-proxy/1.0",
        Accept: "*/*",
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, {
        ...proxyRes.headers,
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) {
      sendJson(res, 502, { error: "proxy fetch failed" });
    } else {
      res.end();
    }
  });

  proxyReq.end();
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(ROOT, safePath.replace(/^\/+/, ""));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (safePath === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
    };
    const contentType = typeMap[ext] || "text/plain";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      });
      res.end();
      return;
    }

    const [pathname, queryString] = req.url.split("?");

    if (pathname === "/proxy" || pathname === "/api/proxy") {
      const params = new URLSearchParams(queryString || "");
      const target = params.get("url");
      return target
        ? handleProxy(req, res, target)
        : sendJson(res, 400, { error: "missing url" });
    }

    serveStatic(req, res, pathname);
  })
  .listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

