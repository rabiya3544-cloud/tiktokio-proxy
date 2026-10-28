// api/persist.js
import { db } from '../lib/db.js';
import { upsertAll } from '../lib/upsert.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const record = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!record || typeof record !== 'object' || !Object.keys(record).length) {
      return res.status(400).json({ error: 'record object required' });
    }
    await upsertAll(db, record);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
