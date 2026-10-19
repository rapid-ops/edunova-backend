require('dotenv').config();
const pool = require('./src/config/db');
const { requestReset } = require('./src/controllers/recovery.controller');
const NAME = 'TIMING TEST DELETE ME', MAIL = 'timing-test@example.com';
const hit = (email) => new Promise((resolve) => {
  const t = process.hrtime.bigint();
  const done = () => resolve(Number(process.hrtime.bigint() - t) / 1e6);
  requestReset({ body: { email } }, { json: done, status: () => ({ json: done }) });
});
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
  const ex = await pool.query('SELECT 1 FROM users WHERE lower(email)=$1', [MAIL]);
  if (ex.rows[0]) { console.log('exists, aborting'); return pool.end(); }
  const u = (await pool.query("INSERT INTO users (school_id, full_name, email, password, role) VALUES (4, $1, $2, 'x', 'student') RETURNING id", [NAME, MAIL])).rows[0];
  const k = [], n = [];
  try {
    await hit(MAIL); await hit('warm@example.com');
    for (let i = 0; i < 15; i++) { k.push(await hit(MAIL)); n.push(await hit('nobody' + i + '@example.com')); }
    console.log('known median ms', med(k).toFixed(0), '| unknown median ms', med(n).toFixed(0));
  } finally {
    await pool.query('DELETE FROM users WHERE id=$1 AND full_name=$2', [u.id, NAME]);
    await pool.end();
  }
})();
