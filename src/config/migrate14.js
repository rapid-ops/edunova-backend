const pool = require('./db');
require('dotenv').config();
(async () => {
  try {
    await pool.query(`ALTER TABLE announcements ALTER COLUMN target_role TYPE VARCHAR(100)`);
    console.log('migrate14 done');
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();
