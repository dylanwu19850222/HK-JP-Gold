// State Management
const state = {
  london: null,
  hkdUsd: null,
  jpyUsd: null,
  tanaka: null,
  usdt: null,
  lastUpdated: null,
};

// Constants
const PROXY_BASE = "/api/proxy?url=";
const OZ_PER_KG = 32.1507466;

// DOM Elements
const els = {
  lastUpdated: document.getElementById("last-updated"),
  refreshBtn: document.getElementById("refresh-btn"),
  metrics: {
    london: document.getElementById("m-london"),
    hkd: document.getElementById("m-hkd"),
    jpy: document.getElementById("m-jpy"),
    tanaka: document.getElementById("m-tanaka"),
    usdt: document.getElementById("m-usdt"),
  },
  tabs: document.querySelectorAll(".tab-btn"),
  panels: document.querySelectorAll(".calc-panel"),
  inputs: {
    hk: {
      kg: document.getElementById("hk-kg"),
      ship: document.getElementById("hk-ship"),
      disc: document.getElementById("hk-disc"),
    },
    jp: {
      kg: document.getElementById("jp-kg"),
      discBuy: document.getElementById("jp-disc-buy"),
      discSell: document.getElementById("jp-disc-sell"),
      misc: document.getElementById("jp-misc"),
      currency: document.getElementById("jp-misc-curr"),
    },
    usdt: {
      amount: document.getElementById("usdt-amount"),
      spread: document.getElementById("usdt-spread"),
    },
  },
  results: {
    hk: document.getElementById("hk-result"),
    jp: document.getElementById("jp-result"),
    usdt: document.getElementById("usdt-result"),
  },
};

// Utilities
const fmt = (n, d = 2) => {
  if (!Number.isFinite(n)) return "--";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
};

const proxyUrl = (url) => `${PROXY_BASE}${encodeURIComponent(url)}&t=${Date.now()}`;

// API Fetchers
async function fetchThroughProxy(url) {
  const res = await fetch(proxyUrl(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function fetchSwissquote(instrument) {
  const res = await fetchThroughProxy(`https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${instrument}`);
  const data = await res.json();
  const quotes = data.flatMap((item) =>
    (item.spreadProfilePrices || []).map((p) => ({ bid: p.bid, ask: p.ask, ts: item.ts }))
  );
  if (!quotes.length) throw new Error("No quotes");
  return {
    bid: Math.max(...quotes.map((q) => q.bid)),
    ask: Math.min(...quotes.map((q) => q.ask)),
    updated: quotes[0].ts,
  };
}

async function fetchTanaka() {
  const res = await fetchThroughProxy("https://gold.tanaka.co.jp/commodity/souba/");
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const getVal = (sel) => {
    const txt = doc.querySelector(sel)?.textContent || "";
    return parseFloat(txt.replace(/,/g, "").replace(/[^\d.]/g, ""));
  };
  
  const bid = getVal("#metal_price tr.gold .purchase_tax");
  const ask = getVal("#metal_price tr.gold .retail_tax");
  
  if (!bid || !ask) throw new Error("Tanaka parse error");
  return { bid, ask };
}

async function fetchGoogleUsdt() {
  const res = await fetchThroughProxy("https://www.google.com/finance/quote/USDT-JPY");
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const priceTxt = doc.querySelector(".YMlKec.fxKbKc")?.textContent;
  const price = parseFloat(priceTxt?.replace(/,/g, ""));
  
  if (!Number.isFinite(price)) throw new Error("Google parse error");
  return { price };
}

// Invert Quote (e.g., USD/JPY -> JPY/USD)
const invert = (q) => ({ bid: 1 / q.ask, ask: 1 / q.bid });

// UI Updaters
function setMetric(el, value, sub, isError = false) {
  const valEl = el.querySelector(".metric-value");
  const subEl = el.querySelector(".metric-sub");
  
  valEl.classList.remove("skeleton");
  if (isError) {
    valEl.textContent = "Error";
    valEl.classList.add("trend-down");
    subEl.textContent = "Retry later";
  } else {
    valEl.textContent = value;
    valEl.classList.remove("trend-down");
    subEl.textContent = sub || "";
  }
}

function setLoading() {
  els.lastUpdated.textContent = "Updating...";
  Object.values(els.metrics).forEach(el => {
    el.querySelector(".metric-value").classList.add("skeleton");
    el.querySelector(".metric-value").textContent = "Loading";
  });
}

// Calculations
function calcHk() {
  const { london, hkdUsd, jpyUsd, tanaka } = state;
  if (!london || !hkdUsd || !jpyUsd || !tanaka) return;

  const kg = parseFloat(els.inputs.hk.kg.value) || 0;
  const shipHkd = parseFloat(els.inputs.hk.ship.value) || 0;
  const disc = parseFloat(els.inputs.hk.disc.value) || 0;

  if (kg <= 0) return;

  const costGoldUsd = kg * OZ_PER_KG * london.ask;
  const costShipUsd = shipHkd * hkdUsd.bid;
  const sellJpyPerGram = Math.max(0, tanaka.bid - disc);
  const revenueJpy = kg * 1000 * sellJpyPerGram;
  const revenueUsd = revenueJpy * jpyUsd.bid;
  const profit = revenueUsd - costGoldUsd - costShipUsd;

  els.results.hk.innerHTML = `
    <div class="result-row"><span>買入成本 (London Ask)</span> <span class="val-highlight">${fmt(costGoldUsd)} USD</span></div>
    <div class="result-row"><span>運費成本</span> <span>${fmt(costShipUsd)} USD</span></div>
    <div class="result-row"><span>日本賣出 (Tanaka Bid)</span> <span>${fmt(revenueUsd)} USD</span></div>
    <div class="result-row total">
      <span>預估損益</span>
      <span class="${profit >= 0 ? 'val-positive' : 'val-negative'}">${fmt(profit)} USD</span>
    </div>
  `;
}

function calcJp() {
  const { tanaka, jpyUsd, hkdUsd } = state;
  if (!tanaka || !jpyUsd) return;

  const kg = parseFloat(els.inputs.jp.kg.value) || 0;
  const discBuy = parseFloat(els.inputs.jp.discBuy.value) || 0;
  const discSell = parseFloat(els.inputs.jp.discSell.value) || 0;
  const misc = parseFloat(els.inputs.jp.misc.value) || 0;
  const curr = els.inputs.jp.currency.value;

  if (kg <= 0) return;

  const grams = kg * 1000;
  const base = tanaka.bid;
  const buyPrice = Math.max(0, base - discBuy);
  const sellPrice = Math.max(0, base - discSell);
  
  const costBuyJpy = grams * buyPrice;
  const revenueSellJpy = grams * sellPrice;
  
  // Misc cost conversion
  let miscJpy = misc;
  if (curr === "USD") miscJpy = misc * (1 / jpyUsd.bid); // approx
  if (curr === "HKD") miscJpy = misc * (hkdUsd?.bid || 0.128) * (1 / jpyUsd.bid);

  const totalCost = costBuyJpy + miscJpy;
  const profitJpy = revenueSellJpy - totalCost;
  const profitUsd = profitJpy * jpyUsd.bid;

  els.results.jp.innerHTML = `
    <div class="result-row"><span>買入單價 (D-A)</span> <span>${fmt(buyPrice, 0)} JPY/g</span></div>
    <div class="result-row"><span>賣出單價 (D-C)</span> <span>${fmt(sellPrice, 0)} JPY/g</span></div>
    <div class="result-row"><span>總成本 (含雜項)</span> <span>${fmt(totalCost, 0)} JPY</span></div>
    <div class="result-row total">
      <span>預估利潤</span>
      <span class="${profitJpy >= 0 ? 'val-positive' : 'val-negative'}">
        ${fmt(profitJpy, 0)} JPY <small>(${fmt(profitUsd)} USD)</small>
      </span>
    </div>
  `;
}

function calcUsdt() {
  const { usdt } = state;
  if (!usdt) return;

  const amount = parseFloat(els.inputs.usdt.amount.value) || 0;
  const spread = parseFloat(els.inputs.usdt.spread.value) || 0;

  if (amount < 0) return;

  const rate = usdt.price + spread;
  const total = amount * rate;

  els.results.usdt.innerHTML = `
    <div class="result-row"><span>Google 報價</span> <span>${fmt(usdt.price)}</span></div>
    <div class="result-row"><span>執行匯率 (含價差)</span> <span class="val-highlight">${fmt(rate)}</span></div>
    <div class="result-row total">
      <span>兌換總額</span>
      <span class="val-positive">${fmt(total, 0)} JPY</span>
    </div>
  `;
}

// Main Load Function
async function loadData() {
  setLoading();
  
  try {
    const [lon, hk, jp, tan] = await Promise.all([
      fetchSwissquote("XAU/USD"),
      fetchSwissquote("USD/HKD"),
      fetchSwissquote("USD/JPY"),
      fetchTanaka()
    ]);

    state.london = lon;
    state.hkdUsd = invert(hk);
    state.jpyUsd = invert(jp);
    state.tanaka = tan;

    setMetric(els.metrics.london, fmt(lon.ask), "XAU/USD Ask");
    setMetric(els.metrics.hkd, fmt(state.hkdUsd.bid, 4), "HKD→USD Bid");
    setMetric(els.metrics.jpy, fmt(state.jpyUsd.bid, 5), "JPY→USD Bid");
    setMetric(els.metrics.tanaka, fmt(tan.bid, 0), "Tanaka Bid");

  } catch (e) {
    console.error("Core data error", e);
    ["london", "hkd", "jpy", "tanaka"].forEach(k => setMetric(els.metrics[k], null, null, true));
  }

  try {
    const u = await fetchGoogleUsdt();
    state.usdt = u;
    setMetric(els.metrics.usdt, fmt(u.price), "USDT/JPY");
  } catch (e) {
    console.error("USDT error", e);
    setMetric(els.metrics.usdt, null, null, true);
  }

  els.lastUpdated.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  calcHk();
  calcJp();
  calcUsdt();
}

// Event Listeners
els.refreshBtn.addEventListener("click", loadData);

// Tab Switching
els.tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    els.tabs.forEach(b => b.classList.remove("active"));
    els.panels.forEach(p => p.classList.remove("active"));
    
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).classList.add("active");
  });
});

// Input Listeners
Object.values(els.inputs).forEach(group => {
  Object.values(group).forEach(input => {
    input.addEventListener("input", () => {
      calcHk();
      calcJp();
      calcUsdt();
    });
  });
});

// Init
loadData();
