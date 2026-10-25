const pool = require('./db');
const run = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_admin_chats (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(80),
        messages JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ai_admin_chats_user ON ai_admin_chats (user_id, updated_at DESC);
    `);
    console.log('ai_admin_chats ready');
  } catch (err) { console.error('migration error:', err.message); }
  finally { process.exit(); }
};
run();
