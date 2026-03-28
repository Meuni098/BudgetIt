const { cors, getStorageMode } = require("./_lib/db");

module.exports = (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return res.status(200).json({ ok: true, service: "budgetit-api", storage: getStorageMode() });
};
