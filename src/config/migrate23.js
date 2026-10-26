require('dotenv').config();
const pool = require('./db');
(async () => {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT');
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name LIKE 'avatar%' ORDER BY 1");
    console.log('migration ok, columns:', r.rows.map((x) => x.column_name).join(', '));
  } catch (e) { console.error('migration failed:', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
