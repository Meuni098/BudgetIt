const { cors, parseCollection, readDb, writeDb } = require("../../_lib/db");

module.exports = (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const collection = parseCollection(req.query.collection);
  if (!collection) return res.status(404).json({ error: "Collection not found" });

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "id is required" });

  const db = readDb();
  const index = db[collection].findIndex((entry) => String(entry.id) === id);
  if (index === -1) return res.status(404).json({ error: "Item not found" });

  if (req.method === "DELETE") {
    const [removed] = db[collection].splice(index, 1);
    writeDb(db);
    return res.status(200).json({ deleted: true, item: removed });
  }

  if (req.method === "PUT") {
    const payload = req.body || {};
    if (payload.amount != null && Number.isNaN(Number(payload.amount))) {
      return res.status(400).json({ error: "amount must be a number" });
    }

    const existing = db[collection][index];
    const updated = {
      ...existing,
      ...payload,
      amount: payload.amount != null ? Number(payload.amount) : existing.amount,
      updatedAt: new Date().toISOString(),
    };

    db[collection][index] = updated;
    writeDb(db);
    return res.status(200).json(updated);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
