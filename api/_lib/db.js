const fs = require("fs");
const path = require("path");

const DB_FILE = path.join("/tmp", "budgetit-store.json");

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

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      income: Array.isArray(parsed.income) ? parsed.income : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      savingsGoals: Array.isArray(parsed.savingsGoals) ? parsed.savingsGoals : [],
    };
  } catch (_err) {
    return initialDb();
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
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

module.exports = {
  readDb,
  writeDb,
  makeId,
  parseCollection,
  cors,
};
