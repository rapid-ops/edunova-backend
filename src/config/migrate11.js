const pool = require('./db');
const run = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_quiz_generations (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        topic TEXT,
        difficulty VARCHAR(20) DEFAULT 'medium',
        num_questions INTEGER DEFAULT 5,
        questions JSONB,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Migration 11 complete');
  } catch (err) { console.error('Migration 11 error:', err.message); }
  finally { process.exit(); }
};
run();
