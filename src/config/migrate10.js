const pool = require('./db');
const run = async () => {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes JSONB DEFAULT '[]';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        key_hash TEXT NOT NULL,
        last_used_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Migration 10 complete');
  } catch (err) { console.error('Migration 10 error:', err.message); }
  finally { process.exit(); }
};
run();
