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

interface AiHistoryItem {
  role?: "user" | "assistant";
  content?: string;
}

interface AiContext {
  monthlyIncome?: number;
  totalExpenses?: number;
  savingsRate?: number;
  goals?: Array<{ name?: string; target?: number; saved?: number }>;
}

interface AiPayload {
  message?: string;
  history?: AiHistoryItem[];
  context?: AiContext;
}

const app = express();
const PORT = Number(process.env.PORT || 3001);
const APP_ROOT = process.cwd();
const DB_PATH = path.join(process.cwd(), "data", "store.json");

app.use(cors());
app.use(express.json());
app.use(express.static(APP_ROOT));

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

function localAiReply(payload: AiPayload): string {
  const question = String(payload.message || "").toLowerCase();
  const ctx = payload.context || {};
  const monthlyIncome = Number(ctx.monthlyIncome || 0);
  const totalExpenses = Number(ctx.totalExpenses || 0);
  const remaining = monthlyIncome - totalExpenses;
  const savingsRate = Number(ctx.savingsRate || 0);

  if (question.includes("food") || question.includes("grocery")) {
    return "To reduce food spending, set a weekly food cap, plan meals before buying groceries, and log each snack/coffee expense the same day. A simple target is a 10-15% cut this week.";
  }

  if (question.includes("save") || question.includes("savings") || question.includes("goal")) {
    const goalsText = (ctx.goals || [])
      .slice(0, 3)
      .map((goal) => `${goal.name || "Goal"}: ${Number(goal.saved || 0)} / ${Number(goal.target || 0)}`)
      .join("; ");
    return `Your current savings rate is about ${savingsRate}%. Improve it by automating a fixed transfer right after income day and reducing one high-frequency expense category. Top goals: ${goalsText || "No goals set yet."}`;
  }

  if (question.includes("budget") || question.includes("plan")) {
    return `You currently have approximately ${remaining.toFixed(2)} left after expenses. Use a simple split: essentials first, then savings, then wants. Re-check your tracker every 2-3 days to avoid overspending.`;
  }

  return "I can help with budgeting, savings goals, and spending analysis. Ask me things like: how to reduce expenses this week, how much to save monthly, or how to rebalance your budget categories.";
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

app.post("/api/ai", async (req: Request, res: Response) => {
  const payload = (req.body || {}) as AiPayload;
  const message = String(payload.message || "").trim();

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return res.json({ reply: localAiReply(payload), source: "local-fallback" });
  }

  try {
    const systemPrompt = [
      "You are BudgetIT AI Assistant.",
      "Give concise, practical financial guidance.",
      "Focus on budgeting, savings, and spending control.",
      "Do not provide legal/medical advice.",
    ].join(" ");

    const history = Array.isArray(payload.history) ? payload.history.slice(-8) : [];
    const messages = [
      { role: "system", content: systemPrompt },
      ...history
        .filter((h) => h && (h.role === "user" || h.role === "assistant") && h.content)
        .map((h) => ({ role: h.role as "user" | "assistant", content: String(h.content) })),
      {
        role: "user",
        content: `${message}\n\nContext: ${JSON.stringify(payload.context || {})}`,
      },
    ];

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages,
      }),
    });

    if (!response.ok) {
      const fallback = localAiReply(payload);
      return res.json({ reply: fallback, source: "local-fallback" });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply = data.choices?.[0]?.message?.content?.trim() || localAiReply(payload);
    return res.json({ reply, source: "openai" });
  } catch (_err) {
    return res.json({ reply: localAiReply(payload), source: "local-fallback" });
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(APP_ROOT, "index.html"));
});

app.get("/app", (_req: Request, res: Response) => {
  res.sendFile(path.join(APP_ROOT, "app.html"));
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
