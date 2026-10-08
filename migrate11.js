const pool = require('./src/config/db');
require('dotenv').config();
(async () => {
  try {
    await pool.query(`
      ALTER TABLE assessments
        ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS rubric JSONB
    `);
    console.log('migrate11 done');
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();
