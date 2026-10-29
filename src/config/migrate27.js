require('dotenv').config();
const pool = require('./db');
(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS school_sites (
      school_id INTEGER PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
      template_slug TEXT NOT NULL,
      draft JSONB NOT NULL DEFAULT '{}'::jsonb,
      published JSONB,
      published_slug TEXT,
      published_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='school_sites' ORDER BY ordinal_position");
    console.log('school_sites columns:', r.rows.map((x) => x.column_name).join(', '));
  } catch (e) { console.error('migration failed:', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
