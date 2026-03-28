const { cors, makeId, parseCollection, readDb, writeDb } = require("../_lib/db");

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const collection = parseCollection(req.query.collection);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const db = await readDb();

  if (req.method === "GET") {
    return res.status(200).json(db[collection]);
  }

  if (req.method === "POST") {
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

    db[collection].push(item);
    await writeDb(db);
    return res.status(201).json(item);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
