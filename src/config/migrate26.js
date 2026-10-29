try { require('dotenv').config(); } catch {}
const pool = require('./db');
(async () => {
  try { await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS teachers_can_notify BOOLEAN NOT NULL DEFAULT true`); console.log('migration done'); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
