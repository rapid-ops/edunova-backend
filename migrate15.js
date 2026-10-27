const pool = require('./src/config/db');
(async () => {
  const t = await pool.query('SELECT DISTINCT type FROM quiz_questions');
  const types = new Set(['mcq', 'true_false', 'short_answer', 'matching', 'fill_blank']);
  t.rows.forEach(r => { if (r.type) types.add(r.type); });
  const list = [...types].map(x => "'" + String(x).replace(/'/g, "''") + "'").join(',');
  await pool.query('ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_type_check');
  await pool.query('ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_type_check CHECK (type IN (' + list + '))');
  console.log('quiz_questions type check updated: ' + list);
  process.exit(0);
})().catch(e => { console.log('migration failed: ' + e.message); process.exit(1); });
