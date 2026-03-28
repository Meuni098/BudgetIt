import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

type CollectionKey = "income" | "expenses" | "savingsGoals";

interface BudgetItem {
  id: string;
  title: string;
  amount: number;
  date: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface DbSchema {
  income: BudgetItem[];
  expenses: BudgetItem[];
  savingsGoals: BudgetItem[];
}

interface ItemPayload {
  title?: string;
  amount?: number | string;
  date?: string;
  notes?: string;
}

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DB_PATH = path.join(process.cwd(), "data", "store.json");

app.use(cors());
app.use(express.json());

function initialDb(): DbSchema {
  return {
    income: [],
    expenses: [],
    savingsGoals: [],
  };
}

function ensureDbFile(): void {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb(), null, 2), "utf8");
  }
}

function asDbShape(value: unknown): DbSchema {
  const safe = (value || {}) as Partial<DbSchema>;
  return {
    income: Array.isArray(safe.income) ? safe.income : [],
    expenses: Array.isArray(safe.expenses) ? safe.expenses : [],
    savingsGoals: Array.isArray(safe.savingsGoals) ? safe.savingsGoals : [],
  };
}

function readDb(): DbSchema {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  try {
    return asDbShape(JSON.parse(raw));
  } catch (_err) {
    return initialDb();
  }
}

function writeDb(data: DbSchema): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function makeId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function sumAmount(items: BudgetItem[]): number {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function toNumber(value: unknown): number {
  return Number(value);
}

function isValidCollectionKey(value: string): value is CollectionKey {
  return value === "income" || value === "expenses" || value === "savingsGoals";
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "budgetit-api", runtime: "typescript" });
});

app.get("/api/summary", (_req: Request, res: Response) => {
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

function registerCollectionRoutes(routeName: string, key: CollectionKey): void {
  app.get(`/api/${routeName}`, (_req: Request, res: Response) => {
    const db = readDb();
    res.json(db[key]);
  });

  app.post(`/api/${routeName}`, (req: Request, res: Response) => {
    const db = readDb();
    const payload = (req.body || {}) as ItemPayload;

    if (payload.amount == null || Number.isNaN(toNumber(payload.amount))) {
      return res.status(400).json({ error: "amount is required and must be a number" });
    }

    const now = new Date().toISOString();
    const item: BudgetItem = {
      id: makeId(),
      title: payload.title || "Untitled",
      amount: toNumber(payload.amount),
      date: payload.date || now.slice(0, 10),
      notes: payload.notes || "",
      createdAt: now,
      updatedAt: now,
    };

    db[key].push(item);
    writeDb(db);

    return res.status(201).json(item);
  });

  app.put(`/api/${routeName}/:id`, (req: Request, res: Response) => {
    const db = readDb();
    const index = db[key].findIndex((entry) => entry.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: "Item not found" });
    }

    const existing = db[key][index];
    const payload = (req.body || {}) as ItemPayload;

    if (payload.amount != null && Number.isNaN(toNumber(payload.amount))) {
      return res.status(400).json({ error: "amount must be a number" });
    }

    const updated: BudgetItem = {
      ...existing,
      title: payload.title ?? existing.title,
      date: payload.date ?? existing.date,
      notes: payload.notes ?? existing.notes,
      amount: payload.amount != null ? toNumber(payload.amount) : existing.amount,
      updatedAt: new Date().toISOString(),
    };

    db[key][index] = updated;
    writeDb(db);

    return res.json(updated);
  });

  app.delete(`/api/${routeName}/:id`, (req: Request, res: Response) => {
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

app.use("/api/:unknown", (req: Request<{ unknown: string }>, res: Response) => {
  if (!isValidCollectionKey(req.params.unknown)) {
    return res.status(404).json({ error: "API route not found" });
  }
  return res.status(404).json({ error: "Item not found" });
});

app.listen(PORT, () => {
  console.log(`BudgetIt API running on http://localhost:${PORT}`);
});
