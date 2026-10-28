import { db } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const sql = (body.sql || '').trim();

  if (!sql) return res.status(400).json({ error: 'sql required' });
  if (!/^select\s/i.test(sql)) return res.status(400).json({ error: 'only SELECT allowed' });
  if (/;/.test(sql.replace(/;\s*$/, ''))) return res.status(400).json({ error: 'single statement only' });

  try {
    const result = await db.execute(sql);
    return res.status(200).json({
      columns: result.columns,
      rows: result.rows,
      count: result.rows.length,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
