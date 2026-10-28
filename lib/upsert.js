// lib/upsert.js
export async function upsertAll(db, record) {
  const uniqueId = Object.keys(record)[0];
  const { author, videos } = record[uniqueId];
  const stmts = [];

  stmts.push({
    sql: `
      INSERT INTO authors (unique_id, nickname, avatar_url, following, followers, hearts, video_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(unique_id) DO UPDATE SET
        nickname = excluded.nickname,
        avatar_url = excluded.avatar_url,
        following = excluded.following,
        followers = excluded.followers,
        hearts = excluded.hearts,
        video_count = excluded.video_count,
        updated_at = unixepoch()
    `,
    args: [
      author.uniqueId, author.nickname, author.avatar,
      author.stats.following, author.stats.followers,
      author.stats.hearts, author.stats.videos,
    ],
  });

  for (const v of videos) {
    stmts.push({
      sql: `
        INSERT INTO videos (video_id, author_id, cover_url, title, plays, likes, comments, shares, saves)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(video_id) DO UPDATE SET
          cover_url = excluded.cover_url,
          title = excluded.title,
          plays = excluded.plays,
          likes = excluded.likes,
          comments = excluded.comments,
          shares = excluded.shares,
          saves = excluded.saves,
          updated_at = unixepoch()
      `,
      args: [
        v.videoId, author.uniqueId, v.cover, v.title,
        v.stats.plays, v.stats.likes, v.stats.comments,
        v.stats.shares, v.stats.saves,
      ],
    });

    for (const [variant, d] of Object.entries(v.downloads)) {
      if (!d.filename) continue;
      stmts.push({
        sql: `
          INSERT INTO downloads (video_id, variant, url, filename, bytes, mime_type, expires_at, refreshed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(video_id, variant) DO UPDATE SET
            url = excluded.url,
            filename = excluded.filename,
            bytes = excluded.bytes,
            mime_type = excluded.mime_type,
            expires_at = excluded.expires_at,
            refreshed_at = unixepoch()
        `,
        args: [
          v.videoId, variant, d.url, d.filename, d.bytes, d.type,
          extractExpiry(d.url),
        ],
      });
    }
  }

  await db.batch(stmts, 'write');
}

function extractExpiry(url) {
  try {
    const p = new URL(url).searchParams.get('p');
    if (!p) return null;
    const b64 = p.slice(7, -10);
    const decoded = atob(b64);
    const m = /(\d{10})$/.exec(decoded);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
