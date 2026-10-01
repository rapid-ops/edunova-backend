const pool = require('./db');

const run = async () => {
  try {
    await pool.query(`
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS instructions TEXT;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN DEFAULT false;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pass_percent INTEGER DEFAULT 50;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS awards_certificate BOOLEAN DEFAULT false;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'submitted';
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS last_score NUMERIC(5,2);
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS passed BOOLEAN DEFAULT false;
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS question_order JSONB;
      UPDATE quiz_attempts SET last_score=score WHERE last_score IS NULL AND score IS NOT NULL;
    `);
    const r = await pool.query(`
      SELECT COUNT(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND (
        (table_name='assessments' AND column_name IN ('instructions','time_limit_minutes','randomize_questions','max_attempts','pass_percent','awards_certificate'))
        OR (table_name='quiz_attempts' AND column_name IN ('attempt_count','status','started_at','last_score','passed','question_order'))
      )`);
    console.log(`Quiz migration done: ${r.rows[0].n} of 12 columns present`);
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
};

run();
