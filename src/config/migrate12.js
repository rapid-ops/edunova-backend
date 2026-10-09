const pool = require('./db');
require('dotenv').config();
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS academic_calendar (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        type VARCHAR(50) DEFAULT 'term' CHECK (type IN ('term','holiday','exam')),
        color VARCHAR(20) DEFAULT '#2563eb',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('migrate12 done');
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();
