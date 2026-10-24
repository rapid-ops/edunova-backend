const pool = require('./db');
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gamification_awards (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ref_type VARCHAR(30) NOT NULL,
        ref_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, ref_type, ref_id)
      );
    `);
    console.log('migrate16 done');
  } catch (e) { console.error(e.message); }
  finally { process.exit(); }
})();
