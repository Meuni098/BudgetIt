const { cors, readDb } = require("./_lib/db");

function sumAmount(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const db = await readDb();
  const incomeTotal = sumAmount(db.income);
  const expenseTotal = sumAmount(db.expenses);
  const savingsGoalTotal = sumAmount(db.savingsGoals);

  return res.status(200).json({
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
};
