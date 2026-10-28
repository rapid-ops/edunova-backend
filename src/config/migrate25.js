const pool = require('./db');
const SQL = `
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE assessments ALTER COLUMN is_published SET DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS show_answers BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS results_released BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE assessments ALTER COLUMN results_released SET DEFAULT false;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS explanation TEXT;
`;
(async () => {
  try { await pool.query(SQL); console.log('migrate25 done'); }
  catch (e) { console.log('migrate25 failed: ' + e.message); process.exitCode = 1; }
  finally { process.exit(); }
})();
