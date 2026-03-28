const fs = require("fs");
const path = require("path");

const DB_FILE = path.join("/tmp", "budgetit-store.json");
const DB_KEY = "budgetit:store";
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

function hasKv() {
  return Boolean(KV_URL && KV_TOKEN);
}

function kvHeaders() {
  return {
    Authorization: `Bearer ${KV_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function initialDb() {
  return {
    income: [],
    expenses: [],
    savingsGoals: [],
  };
}

function ensureDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb(), null, 2), "utf8");
  }
}

function normalizeDb(parsed) {
  return {
    income: Array.isArray(parsed.income) ? parsed.income : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    savingsGoals: Array.isArray(parsed.savingsGoals) ? parsed.savingsGoals : [],
  };
}

function readDbFromFile() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeDb(parsed);
  } catch (_err) {
    return initialDb();
  }
}

async function readDbFromKv() {
  const response = await fetch(`${KV_URL}/get/${encodeURIComponent(DB_KEY)}`, {
    method: "GET",
    headers: kvHeaders(),
  });

  if (!response.ok) {
    throw new Error(`KV read failed (${response.status})`);
  }

  const payload = await response.json();
  if (!payload.result) {
    return initialDb();
  }

  try {
    const parsed = JSON.parse(payload.result);
    return normalizeDb(parsed);
  } catch (_err) {
    return initialDb();
  }
}

function writeDbToFile(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function writeDbToKv(data) {
  const value = encodeURIComponent(JSON.stringify(normalizeDb(data)));
  const response = await fetch(`${KV_URL}/set/${encodeURIComponent(DB_KEY)}/${value}`, {
    method: "GET",
    headers: kvHeaders(),
  });

  if (!response.ok) {
    throw new Error(`KV write failed (${response.status})`);
  }
}

async function readDb() {
  if (hasKv()) {
    try {
      return await readDbFromKv();
    } catch (_err) {
      return readDbFromFile();
    }
  }

  return readDbFromFile();
}

async function writeDb(data) {
  if (hasKv()) {
    try {
      await writeDbToKv(data);
      return;
    } catch (_err) {
      writeDbToFile(data);
      return;
    }
  }

  writeDbToFile(data);
}

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function parseCollection(value) {
  const v = String(value || "").toLowerCase();
  if (v === "income") return "income";
  if (v === "expenses") return "expenses";
  if (v === "savings-goals") return "savingsGoals";
  return "";
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getStorageMode() {
  return hasKv() ? "vercel-kv" : "tmp-file";
}

module.exports = {
  readDb,
  writeDb,
  makeId,
  parseCollection,
  cors,
  getStorageMode,
};
