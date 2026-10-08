const pool = require('./src/config/db');

const migrate = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_quiz_generations (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        topic VARCHAR(255),
        difficulty VARCHAR(50) DEFAULT 'medium',
        num_questions INTEGER DEFAULT 5,
        questions JSONB DEFAULT '[]',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('migrate11 complete');
  } catch (err) { console.error('migrate11 error:', err.message); }
  finally { process.exit(); }
};

migrate();
