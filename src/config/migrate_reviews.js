const pool = require('./db');

const run = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS course_reviews (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(course_id, student_id)
      );
      CREATE INDEX IF NOT EXISTS idx_course_reviews_course ON course_reviews(course_id);
    `);
    const r = await pool.query(`SELECT to_regclass('public.course_reviews') AS t`);
    console.log(r.rows[0].t ? 'Reviews migration done: table present' : 'Table missing');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
};

run();
