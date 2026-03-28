const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, "data", "store.json");

app.use(cors());
app.use(express.json());

function ensureDbFile() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const initialData = {
      income: [],
      expenses: [],
      savingsGoals: [],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), "utf8");
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function sumAmount(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "budgetit-api" });
});

app.get("/api/summary", (_req, res) => {
  const db = readDb();

  const incomeTotal = sumAmount(db.income);
  const expenseTotal = sumAmount(db.expenses);
  const savingsGoalTotal = sumAmount(db.savingsGoals);

  res.json({
    totals: {
      income: incomeTotal,
      expenses: expenseTotal,
      savingsGoals: savingsGoalTotal,
      balance: incomeTotal - expenseTotal,
    },
    counts: {
      income: db.income.length,
      expenses: db.expenses.length,
      savingsGoals: db.savingsGoals.length,
    },
  });
});

function registerCollectionRoutes(routeName, key) {
  app.get(`/api/${routeName}`, (_req, res) => {
    const db = readDb();
    res.json(db[key]);
  });

  app.post(`/api/${routeName}`, (req, res) => {
    const db = readDb();
    const payload = req.body || {};

    if (payload.amount == null || Number.isNaN(Number(payload.amount))) {
      return res.status(400).json({ error: "amount is required and must be a number" });
    }

    const item = {
      id: makeId(),
      title: payload.title || "Untitled",
      amount: Number(payload.amount),
      date: payload.date || new Date().toISOString().slice(0, 10),
      notes: payload.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db[key].push(item);
    writeDb(db);

    return res.status(201).json(item);
  });

  app.put(`/api/${routeName}/:id`, (req, res) => {
    const db = readDb();
    const index = db[key].findIndex((entry) => entry.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: "Item not found" });
    }

    const existing = db[key][index];
    const payload = req.body || {};

    if (payload.amount != null && Number.isNaN(Number(payload.amount))) {
      return res.status(400).json({ error: "amount must be a number" });
    }

    const updated = {
      ...existing,
      ...payload,
      amount: payload.amount != null ? Number(payload.amount) : existing.amount,
      updatedAt: new Date().toISOString(),
    };

    db[key][index] = updated;
    writeDb(db);

    return res.json(updated);
  });

  app.delete(`/api/${routeName}/:id`, (req, res) => {
    const db = readDb();
    const index = db[key].findIndex((entry) => entry.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: "Item not found" });
    }

    const [removed] = db[key].splice(index, 1);
    writeDb(db);

    return res.json({ deleted: true, item: removed });
  });
}

registerCollectionRoutes("income", "income");
registerCollectionRoutes("expenses", "expenses");
registerCollectionRoutes("savings-goals", "savingsGoals");

app.listen(PORT, () => {
  console.log(`BudgetIt API running on http://localhost:${PORT}`);
});
