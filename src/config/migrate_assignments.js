const pool = require('./db');

const run = async () => {
  try {
    await pool.query(`
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS instructions TEXT;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS attachment_url TEXT;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS allow_late BOOLEAN DEFAULT true;

      ALTER TABLE submissions ALTER COLUMN file_url DROP NOT NULL;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS text_answer TEXT;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS score NUMERIC(5,2);
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS feedback TEXT;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'submitted';
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP;
    `);
    console.log('Assignments migration done');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
};

run();
