// api/migrate.js
import { db } from '../lib/db.js';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS authors (
    unique_id TEXT PRIMARY KEY,
    nickname TEXT,
    avatar_url TEXT,
    following INTEGER NOT NULL DEFAULT 0,
    followers INTEGER NOT NULL DEFAULT 0,
    hearts INTEGER NOT NULL DEFAULT 0,
    video_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS videos (
    video_id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES authors(unique_id) ON DELETE CASCADE,
    cover_url TEXT,
    title TEXT,
    plays INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS idx_videos_author ON videos(author_id)`,
  `CREATE TABLE IF NOT EXISTS downloads (
    video_id TEXT NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    variant TEXT NOT NULL CHECK (variant IN ('hd','sd','watermark','audio')),
    url TEXT,
    filename TEXT NOT NULL,
    bytes INTEGER,
    mime_type TEXT,
    expires_at INTEGER,
    refreshed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (video_id, variant)
  ) WITHOUT ROWID`,
  `CREATE VIEW IF NOT EXISTS v_downloads_live AS
    SELECT * FROM downloads
    WHERE expires_at IS NULL OR expires_at > unixepoch()`,
  `CREATE VIEW IF NOT EXISTS v_video_engagement AS
    SELECT video_id, author_id, plays, likes, comments, shares, saves,
      CASE WHEN plays > 0 THEN ROUND((likes + comments + shares + saves) * 100.0 / plays, 2) END AS engagement_pct
    FROM videos`,
  `CREATE VIEW IF NOT EXISTS v_video_full AS
    SELECT v.video_id, v.author_id, a.nickname, a.avatar_url, v.cover_url, v.title,
      v.plays, v.likes, v.comments, v.shares, v.saves,
      MAX(CASE WHEN d.variant = 'hd' THEN d.url END) AS hd_url,
      MAX(CASE WHEN d.variant = 'hd' THEN d.filename END) AS hd_file,
      MAX(CASE WHEN d.variant = 'hd' THEN d.bytes END) AS hd_bytes,
      MAX(CASE WHEN d.variant = 'sd' THEN d.url END) AS sd_url,
      MAX(CASE WHEN d.variant = 'sd' THEN d.filename END) AS sd_file,
      MAX(CASE WHEN d.variant = 'sd' THEN d.bytes END) AS sd_bytes,
      MAX(CASE WHEN d.variant = 'watermark' THEN d.url END) AS watermark_url,
      MAX(CASE WHEN d.variant = 'watermark' THEN d.filename END) AS watermark_file,
      MAX(CASE WHEN d.variant = 'watermark' THEN d.bytes END) AS watermark_bytes,
      MAX(CASE WHEN d.variant = 'audio' THEN d.url END) AS audio_url,
      MAX(CASE WHEN d.variant = 'audio' THEN d.filename END) AS audio_file,
      MAX(CASE WHEN d.variant = 'audio' THEN d.bytes END) AS audio_bytes
    FROM videos v
    JOIN authors a ON a.unique_id = v.author_id
    LEFT JOIN v_downloads_live d ON d.video_id = v.video_id
    GROUP BY v.video_id`,
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const results = [];
    for (const sql of STATEMENTS) {
      await db.execute(sql);
      results.push({ ok: true, stmt: sql.slice(0, 60) + '...' });
    }

    const check = await db.execute(
      `SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`
    );

    return res.status(200).json({
      ok: true,
      ran: results.length,
      objects: check.rows,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
