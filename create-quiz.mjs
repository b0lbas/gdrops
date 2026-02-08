#!/usr/bin/env node

/**
 * Wikidata seed generator for GeoDropsQuiz.
 *
 * Примечание: файл использует ESM (import ...). Запускайте как:
 *   - node wd-seed.js  (если в package.json есть "type": "module")
 *   - или переименуйте в wd-seed.mjs
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "GeoDropsQuiz/1.1 (https://github.com/b0lbas/gdrops)";

// Defaults (override via env if нужно)
const TIMEOUT_MS = Number(process.env.WDQS_TIMEOUT_MS ?? 60_000);
const RETRIES = Number(process.env.WDQS_RETRIES ?? 4);
const BACKOFF_BASE_MS = Number(process.env.WDQS_BACKOFF_BASE_MS ?? 1000);
const MAX_BACKOFF_MS = Number(process.env.WDQS_MAX_BACKOFF_MS ?? 15_000);
const MAX_TYPES_SHOWN = Number(process.env.WDQS_TYPES_SHOWN ?? 50);
const LANGS = normalizeLangs(process.env.WDQS_LANGS ?? "en");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeLangs(raw) {
  const s = String(raw ?? "").trim();
  // WDQS label service expects something like: "es,en".
  // Разрешаем a-z, 0-9, - и запятые.
  const cleaned = s.replace(/[^a-zA-Z0-9,-]/g, "");
  return cleaned || "en";
}

function val(binding, key) {
  return binding?.[key]?.value ?? "";
}

function normName(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const v = String(headerValue).trim();
  if (!v) return null;
  // seconds
  const asInt = Number(v);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
  // HTTP-date
  const dt = Date.parse(v);
  if (!Number.isNaN(dt)) {
    const ms = dt - Date.now();
    return ms > 0 ? ms : 0;
  }
  return null;
}

function capText(text, max = 1500) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

async function sparql(query, label) {
  const url = `${ENDPOINT}?format=json`;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      if (label) console.log(`Request: ${label} (try ${attempt}/${RETRIES})`);

      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          accept: "application/sparql-results+json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": USER_AGENT
        },
        body: new URLSearchParams({ query })
      });

      // Rate limiting / temporary failures
      if (res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504) {
        const ra = parseRetryAfter(res.headers.get("retry-after"));
        const wait = ra ?? Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
        if (attempt === RETRIES) {
          const body = capText(await res.text().catch(() => ""));
          throw new Error(`SPARQL temporary error ${res.status}. ${body}`);
        }
        await sleep(wait + Math.floor(Math.random() * 250));
        continue;
      }

      if (!res.ok) {
        const body = capText(await res.text().catch(() => ""));
        throw new Error(`SPARQL failed: ${res.status}. ${body}`);
      }

      const data = await res.json();
      const bindings = data?.results?.bindings;
      if (!Array.isArray(bindings)) {
        throw new Error("Unexpected SPARQL JSON (no results.bindings)");
      }
      return bindings;
    } catch (err) {
      const msg = String(err?.message ?? err);
      const retryable =
        msg.includes("aborted") ||
        msg.includes("AbortError") ||
        msg.includes("fetch failed") ||
        msg.includes("network") ||
        msg.includes("ECONN") ||
        msg.includes("ETIMEDOUT");

      if (!retryable || attempt === RETRIES) throw err;
      const wait = Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
      await sleep(wait + Math.floor(Math.random() * 250));
    } finally {
      clearTimeout(t);
    }
  }

  return [];
}

function fileToUrl(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already a URL
  if (/^https?:\/\//i.test(s)) return s;

  // Sometimes the value can be like "File:Something.svg" or "...File:Something.svg"
  const idx = s.toLowerCase().lastIndexOf("file:");
  const name = idx >= 0 ? s.slice(idx + 5) : s;
  const cleaned = name.replace(/\s+/g, "_");
  if (!cleaned) return null;

  return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(cleaned);
}

function pickImage(row) {
  const candidates = [
    { key: "flag", source: "flag" },
    { key: "coat", source: "coat" },
    { key: "seal", source: "seal" },
    { key: "logo", source: "logo" },
    { key: "loc", source: "locator_map" },
    { key: "image", source: "image" }
  ];

  for (const c of candidates) {
    const u = fileToUrl(val(row, c.key));
    if (u) return { url: u, source: c.source };
  }
  return { url: null, source: "missing" };
}

function detectScript(label) {
  // Approx: если есть явные не-латинские скрипты — считаем nonlatin
  // (в Node поддерживаются Unicode property escapes)
  if (/\p{Script=Cyrillic}/u.test(label)) return "cyrillic";
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(label)) return "cjk";
  if (/\p{Script=Arabic}/u.test(label)) return "arabic";
  if (/\p{Script=Hebrew}/u.test(label)) return "hebrew";
  if (/\p{Script=Greek}/u.test(label)) return "greek";
  return "latin";
}

const STRATEGIES = [
  {
    id: "p150",
    description: "via P150 hierarchy",
    typesQuery: (country) => `
      SELECT ?type ?typeLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
        <${country}> wdt:P150* ?item .
        FILTER(?item != <${country}>)
        ?item wdt:P31 ?type .
        ?type wdt:P279* wd:Q56061 .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      GROUP BY ?type ?typeLabel
      ORDER BY DESC(?count) ?typeLabel
    `,
    itemsQuery: (country, type) => `
      SELECT ?item ?itemLabel
             (SAMPLE(?flag) AS ?flag)
             (SAMPLE(?coat) AS ?coat)
             (SAMPLE(?seal) AS ?seal)
             (SAMPLE(?logo) AS ?logo)
             (SAMPLE(?loc) AS ?loc)
             (SAMPLE(?image) AS ?image)
      WHERE {
        <${country}> wdt:P150* ?item .
        FILTER(?item != <${country}>)
        ?item wdt:P31 <${type}> .
        OPTIONAL { ?item wdt:P41 ?flag. }
        OPTIONAL { ?item wdt:P94 ?coat. }
        OPTIONAL { ?item wdt:P158 ?seal. }
        OPTIONAL { ?item wdt:P154 ?logo. }
        OPTIONAL { ?item wdt:P242 ?loc. }
        OPTIONAL { ?item wdt:P18 ?image. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGS}". }
      }
      GROUP BY ?item ?itemLabel
    `
  },
  {
    id: "p131",
    description: "via P131 containment",
    typesQuery: (country) => `
      SELECT ?type ?typeLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
        ?item wdt:P131* <${country}> .
        ?item wdt:P31 ?type .
        ?type wdt:P279* wd:Q56061 .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      GROUP BY ?type ?typeLabel
      ORDER BY DESC(?count) ?typeLabel
    `,
    itemsQuery: (country, type) => `
      SELECT ?item ?itemLabel
             (SAMPLE(?flag) AS ?flag)
             (SAMPLE(?coat) AS ?coat)
             (SAMPLE(?seal) AS ?seal)
             (SAMPLE(?logo) AS ?logo)
             (SAMPLE(?loc) AS ?loc)
             (SAMPLE(?image) AS ?image)
      WHERE {
        ?item wdt:P131* <${country}> ;
              wdt:P31 <${type}> .
        OPTIONAL { ?item wdt:P41 ?flag. }
        OPTIONAL { ?item wdt:P94 ?coat. }
        OPTIONAL { ?item wdt:P158 ?seal. }
        OPTIONAL { ?item wdt:P154 ?logo. }
        OPTIONAL { ?item wdt:P242 ?loc. }
        OPTIONAL { ?item wdt:P18 ?image. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGS}". }
      }
      GROUP BY ?item ?itemLabel
    `
  },
  {
    id: "p17",
    description: "fallback via P17 (can be slow)",
    // Важно: ограничиваемся только админ-терр. единицами, иначе таймаут практически гарантирован.
    typesQuery: (country) => `
      SELECT ?type ?typeLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
        ?item wdt:P17 <${country}> .
        ?item wdt:P31/wdt:P279* wd:Q56061 .
        ?item wdt:P31 ?type .
        ?type wdt:P279* wd:Q56061 .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      GROUP BY ?type ?typeLabel
      ORDER BY DESC(?count) ?typeLabel
    `,
    itemsQuery: (country, type) => `
      SELECT ?item ?itemLabel
             (SAMPLE(?flag) AS ?flag)
             (SAMPLE(?coat) AS ?coat)
             (SAMPLE(?seal) AS ?seal)
             (SAMPLE(?logo) AS ?logo)
             (SAMPLE(?loc) AS ?loc)
             (SAMPLE(?image) AS ?image)
      WHERE {
        ?item wdt:P17 <${country}> ;
              wdt:P31 <${type}> .
        OPTIONAL { ?item wdt:P41 ?flag. }
        OPTIONAL { ?item wdt:P94 ?coat. }
        OPTIONAL { ?item wdt:P158 ?seal. }
        OPTIONAL { ?item wdt:P154 ?logo. }
        OPTIONAL { ?item wdt:P242 ?loc. }
        OPTIONAL { ?item wdt:P18 ?image. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGS}". }
      }
      GROUP BY ?item ?itemLabel
    `
  }
];

async function getCountryByIso(iso2) {
  const rows = await sparql(
    `
    SELECT ?country ?countryLabel WHERE {
      ?country wdt:P297 "${iso2}".
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 2
    `,
    "country by ISO"
  );

  if (!rows.length) return null;
  return {
    uri: val(rows[0], "country"),
    label: val(rows[0], "countryLabel") || iso2
  };
}

async function getAdminTypes(countryUri) {
  let lastErr = null;
  for (const strat of STRATEGIES) {
    try {
      const rows = await sparql(strat.typesQuery(countryUri), `admin types (${strat.id})`);
      if (rows.length) return { rows, strat };
    } catch (e) {
      lastErr = e;
      // Не спамим full stack, только сообщение.
      console.warn(`Warn: strategy ${strat.id} failed: ${String(e?.message ?? e)}`);
    }
  }
  if (lastErr) throw lastErr;
  return { rows: [], strat: null };
}

async function getItems(countryUri, typeUri, startStrategyId) {
  const startIdx = Math.max(
    0,
    STRATEGIES.findIndex((s) => s.id === startStrategyId)
  );

  let lastErr = null;
  for (let i = startIdx; i < STRATEGIES.length; i++) {
    const strat = STRATEGIES[i];
    try {
      const rows = await sparql(strat.itemsQuery(countryUri, typeUri), `items (${strat.id})`);
      if (rows.length) return { rows, strat };
    } catch (e) {
      lastErr = e;
      console.warn(`Warn: items strategy ${strat.id} failed: ${String(e?.message ?? e)}`);
    }
  }

  if (lastErr) throw lastErr;
  return { rows: [], strat: STRATEGIES[startIdx] ?? STRATEGIES[0] };
}

async function main() {
  try {
    const iso = (await ask("ISO code (2 letters, e.g. ES): ")).toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso)) throw new Error("Bad ISO code");

    const country = await getCountryByIso(iso);
    if (!country) throw new Error("Country not found for ISO " + iso);

    const { rows: typeRowsRaw, strat: typesStrat } = await getAdminTypes(country.uri);
    if (!typeRowsRaw.length) throw new Error("No admin types found for " + country.label);

    const typeRows = typeRowsRaw
      .map((r) => ({
        type: val(r, "type"),
        label: val(r, "typeLabel") || "(no label)",
        count: Number(val(r, "count") || 0)
      }))
      .filter((x) => x.type && x.count > 0);

    if (!typeRows.length) throw new Error("No usable admin types found for " + country.label);

    console.log(`\nChoose division type (strategy: ${typesStrat?.id ?? "?"}):`);
    typeRows.slice(0, MAX_TYPES_SHOWN).forEach((r, i) => {
      console.log(`${i + 1}) ${r.label} (${r.count})`);
    });

    const pick = parseInt(await ask("Type number: "), 10);
    if (!pick || pick < 1 || pick > Math.min(MAX_TYPES_SHOWN, typeRows.length)) {
      throw new Error("Bad selection");
    }

    const type = typeRows[pick - 1].type;
    const typeLabel = typeRows[pick - 1].label;

    const { rows: itemRows, strat: itemsStrat } = await getItems(country.uri, type, typesStrat?.id);
    if (!itemRows.length) throw new Error(`No items found for ${country.label} / ${typeLabel}`);

    const items = [];
    const report = [];
    let missing = 0;

    const seen = new Set();
    for (const r of itemRows) {
      const label = normName(val(r, "itemLabel"));
      if (!label) continue;
      if (seen.has(label)) continue;
      seen.add(label);

      const img = pickImage(r);
      if (!img.url) missing += 1;

      const lower = label.toLowerCase();
      const altAnswers = [];
      if (lower && lower !== label) altAnswers.push(lower);

      items.push({
        answerText: label,
        promptImage: img.url,
        altAnswers,
        tags: {
          country: iso,
          subdivisionType: typeLabel,
          script: detectScript(label)
        },
        imageSource: img.source
      });

      report.push({ name: label, image: img.url, source: img.source });
    }

    items.sort((a, b) => a.answerText.localeCompare(b.answerText, "en", { sensitivity: "base" }));

    const seed = {
      quizTitle: `${country.label} - ${typeLabel}`,
      topicTitle: "Default",
      items
    };

    const seedsDir = path.join(process.cwd(), "public", "seeds");
    const reportPath = path.join(process.cwd(), "seed.report.json");
    ensureDirForFile(path.join(seedsDir, "index.json"));

    const slug = (s) => {
      const base = String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return base || "seed";
    };

    const baseName = `${iso.toLowerCase()}-${slug(typeLabel)}`;
    let fileName = `${baseName}.json`;
    let seedPath = path.join(seedsDir, fileName);
    let n = 2;
    while (fs.existsSync(seedPath)) {
      fileName = `${baseName}-${n}.json`;
      seedPath = path.join(seedsDir, fileName);
      n += 1;
    }

    ensureDirForFile(seedPath);

    fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2), "utf8");

    const indexPath = path.join(seedsDir, "index.json");
    let idx = { files: [] };
    try {
      idx = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch {}
    const rel = "seeds/" + fileName;
    const files = Array.isArray(idx.files) ? idx.files : [];
    if (!files.includes(rel)) files.push(rel);
    fs.writeFileSync(indexPath, JSON.stringify({ files }, null, 2), "utf8");
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          country: country.label,
          type: typeLabel,
          strategyTypes: typesStrat?.id,
          strategyItems: itemsStrat?.id,
          total: items.length,
          missing,
          report
        },
        null,
        2
      ),
      "utf8"
    );

    console.log(`\nDone. Items: ${items.length}, missing images: ${missing}`);
    console.log("Strategy(types):", typesStrat?.id);
    console.log("Strategy(items):", itemsStrat?.id);
    console.log("Generated:", seedPath);
    console.log("Report:", reportPath);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
