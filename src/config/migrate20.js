const pool = require('./db');
(async () => {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_emailed_at TIMESTAMP;\nALTER TABLE users ADD COLUMN IF NOT EXISTS invite_tried_at TIMESTAMP;\nUPDATE users SET invite_emailed_at = invited_at, invite_tried_at = invited_at WHERE role = 'parent' AND invited_at IS NOT NULL AND invite_emailed_at IS NULL;\n");
    console.log('migrate20 done');
  } catch (e) { console.error(e.message); }
  finally { process.exit(); }
})();
