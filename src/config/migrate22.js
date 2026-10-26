const pool = require('./db');
const run = async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT;`);
    console.log('Migration 22 complete');
  } catch (err) {
    console.error('Migration 22 error:', err.message);
  } finally {
    process.exit();
  }
};
run();
