const pool = require('./db');
(async () => {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id VARCHAR(30);\nALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;\nALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires TIMESTAMP;\nALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;\nALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMP;\nCREATE UNIQUE INDEX IF NOT EXISTS users_login_id_key ON users (login_id) WHERE login_id IS NOT NULL;\nUPDATE users u SET login_id = 'EDU' || u.school_id || '-' || CASE u.role WHEN 'student' THEN 'S' ELSE 'T' END || LPAD(n.rn::text, 4, '0')\nFROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY school_id, role ORDER BY id) AS rn FROM users WHERE role IN ('student','teacher') AND school_id IS NOT NULL) n\nWHERE u.id = n.id AND u.login_id IS NULL;\n");
    console.log('migrate19 done');
  } catch (e) { console.error(e.message); }
  finally { process.exit(); }
})();
