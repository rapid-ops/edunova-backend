const pool = require('./db');
(async () => {
  try {
    await pool.query(`ALTER TABLE lessons ADD COLUMN IF NOT EXISTS file_path TEXT, ADD COLUMN IF NOT EXISTS file_name TEXT, ADD COLUMN IF NOT EXISTS file_type VARCHAR(20), ADD COLUMN IF NOT EXISTS file_size BIGINT`);
    const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='lessons' AND column_name LIKE 'file_%' ORDER BY 1`);
    console.log('lessons file columns:', r.rows.map(x => x.column_name).join(', '));
  } catch (e) { console.error('migration failed:', e.message); process.exitCode = 1; }
  await pool.end(); process.exit();
})();
