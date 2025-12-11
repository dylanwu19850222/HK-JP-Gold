// Vercel Serverless proxy for allowed upstreams (Swissquote, Tanaka)
const ALLOW_HOSTS = new Set([
  "forex-data-feed.swissquote.com",
  "gold.tanaka.co.jp",
]);

function isAllowed(targetUrl) {
  try {
    const u = new URL(targetUrl);
    return (u.protocol === "https:" || u.protocol === "http:") && ALLOW_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204)
      .setHeader("Access-Control-Allow-Origin", "*")
      .setHeader("Access-Control-Allow-Headers", "*")
      .setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
      .end();
    return;
  }

  const target = req.query.url;
  if (!target || !isAllowed(target)) {
    res
      .status(400)
      .setHeader("Access-Control-Allow-Origin", "*")
      .json({ error: "missing or not allowed url" });
    return;
  }

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent": "hk-jp-gold-proxy/1.0",
        Accept: "*/*",
      },
    });

    const headers = {};
    upstream.headers.forEach((v, k) => {
      headers[k] = v;
    });
    headers["access-control-allow-origin"] = "*";
    headers["access-control-allow-headers"] = "*";

    res.status(upstream.status);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("Proxy error:", err);
    res
      .status(502)
      .setHeader("Access-Control-Allow-Origin", "*")
      .json({ error: "proxy fetch failed" });
  }
}

