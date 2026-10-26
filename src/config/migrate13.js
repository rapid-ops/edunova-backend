const pool = require('./db');
require('dotenv').config();
(async () => {
  try {
    await pool.query(`
      ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_url TEXT;
    `);
    console.log('migrate13 done');
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();
