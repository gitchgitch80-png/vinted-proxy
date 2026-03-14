const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const VINTED_DOMAINS = {
  FR: "www.vinted.fr", BE: "www.vinted.be", ES: "www.vinted.es",
  IT: "www.vinted.it", DE: "www.vinted.de", NL: "www.vinted.nl",
  PT: "www.vinted.pt", GB: "www.vinted.co.uk", PL: "www.vinted.pl",
  CZ: "www.vinted.cz", LU: "www.vinted.lu", AT: "www.vinted.at",
  SE: "www.vinted.se", FI: "www.vinted.fi", DK: "www.vinted.dk",
  RO: "www.vinted.ro", HU: "www.vinted.hu", HR: "www.vinted.hr",
  SK: "www.vinted.sk", LT: "www.vinted.lt",
};

const tokenCache = {};

async function getToken(domain) {
  if (tokenCache[domain] && tokenCache[domain].expires > Date.now()) {
    return tokenCache[domain].token;
  }
  try {
    const res = await axios.get(`https://${domain}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      timeout: 8000,
    });
    const match = res.headers["set-cookie"]?.join("")?.match(/access_token_web=([^;]+)/);
    if (match) {
      tokenCache[domain] = { token: match[1], expires: Date.now() + 20 * 60 * 1000 };
      return match[1];
    }
  } catch (e) {}
  return null;
}

async function searchVinted(domain, query, params = {}) {
  const token = await getToken(domain);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Referer": `https://${domain}/`,
    "Origin": `https://${domain}`,
  };
  if (token) headers["Cookie"] = `access_token_web=${token}`;

  const urlParams = new URLSearchParams({
    search_text: query,
    order: params.order || "newest_first",
    per_page: params.per_page || "30",
    page: params.page || "1",
    ...(params.price_from && { price_from: params.price_from }),
    ...(params.price_to && { price_to: params.price_to }),
  });

  const url = `https://${domain}/api/v2/catalog/items?${urlParams}`;
  const res = await axios.get(url, { headers, timeout: 10000 });
  return res.data;
}

function formatItem(item, country, domain) {
  return {
    id: item.id,
    title: item.title,
    price: parseFloat(item.price) || 0,
    currency: item.currency,
    size: item.size_title || item.size || "—",
    brand: item.brand_title || "—",
    state: item.status || "—",
    country,
    image: item.photo?.url || item.photos?.[0]?.url || null,
    url: `https://${domain}/items/${item.id}-${item.slug || "item"}`,
    buyUrl: `https://${domain}/transaction/buy/item?item_id=${item.id}`,
    ts: item.created_at_ts ? item.created_at_ts * 1000 : new Date(item.created_at).getTime(),
  };
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Vinted Football Proxy actif 🚀" });
});

app.get("/search", async (req, res) => {
  const { query, countries = "FR", price_to = "20", price_from = "0", order = "newest_first", per_page = "30" } = req.query;
  if (!query) return res.status(400).json({ error: "query requis" });

  const countryList = countries.split(",").map(c => c.trim().toUpperCase());
  const results = [];
  const errors = [];

  await Promise.allSettled(countryList.map(async (country) => {
    const domain = VINTED_DOMAINS[country];
    if (!domain) return;
    try {
      const data = await searchVinted(domain, query, { order, per_page, price_from, price_to });
      results.push(...(data.items || []).map(i => formatItem(i, country, domain)));
    } catch (e) {
      errors.push({ country, error: e.message });
    }
  }));

  results.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ total: results.length, items: results, errors: errors.length ? errors : undefined });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Proxy démarré sur le port ${PORT}`));
