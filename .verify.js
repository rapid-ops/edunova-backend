require('dotenv').config();
const pool = require('./src/config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const B = 'https://edunova-backend-2x7h.onrender.com/api', F = 'https://edunova-frontend-gkaj.vercel.app';
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const say = (n, c, d) => console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  [' + d + ']' : ''));
const call = async (m, p, b, t) => {
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = 'Bearer ' + t;
  const r = await fetch(B + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const NAME = 'VERIFY DELETE ME', made = [];
const mk = async (email, role, sid) => {
  const r = await pool.query('INSERT INTO users (school_id, full_name, email, password, role) VALUES ($1,$2,$3,$4,$5) RETURNING id', [sid, NAME, email, await bcrypt.hash('OldPass123', 10), role]);
  made.push(r.rows[0].id); return r.rows[0].id;
};
const setTok = async (id, iv) => {
  const raw = crypto.randomBytes(32).toString('hex');
  await pool.query('UPDATE users SET reset_token=$1, reset_token_expires=NOW() + $2::interval WHERE id=$3', [sha(raw), iv, id]);
  return raw;
};
(async () => {
  let sid = 4;
  try {
    for (const u of ['/auth/login', '/auth/forgot-password', '/auth/reset-password?token=x', '/auth/reset-success', '/school-admin/students', '/school-admin/branding', '/school-admin/custom-roles', '/dashboard/audit-logs']) {
      const s = (await fetch(F + u)).status; say('page ' + u, s === 200, s);
    }
    say('health', (await call('GET', '/health')).s === 200);
    const PW = process.env.PW, toks = {};
    for (const r of ['school_admin', 'teacher', 'student', 'parent', 'super_admin']) {
      const q = await pool.query("SELECT email FROM users WHERE role=$1 AND suspended_at IS NULL AND COALESCE(totp_enabled,false)=false ORDER BY (COALESCE(school_id,0)=4) DESC, id LIMIT 1", [r]);
      if (!q.rows[0]) { console.log('SKIP login ' + r + ' (no such user)'); continue; }
      const x = await call('POST', '/auth/login', { email: q.rows[0].email, password: PW });
      say('login ' + r + ' ' + q.rows[0].email, x.s === 200 && x.j.token && x.j.user.role === r, x.s + (x.j.error ? ' ' + x.j.error : ''));
      if (x.j.token) toks[r] = x.j;
    }
    const sa = toks.school_admin;
    if (sa) {
      sid = sa.user.school_id; const t = sa.token; let x;
      x = await call('GET', '/schools/' + sid + '/students', null, t); say('students list', x.s === 200 && Array.isArray(x.j.students), x.s);
      x = await call('GET', '/audit-logs/' + sid, null, t); say('audit logs', x.s === 200, x.s + ' keys=' + Object.keys(x.j));
      x = await call('GET', '/api-keys', null, t); say('api keys list', x.s === 200, x.s);
      await call('POST', '/custom-roles', { name: 'VERIFY ROLE', permissions: ['view_students'], school_id: sid }, t);
      x = await call('GET', '/custom-roles/' + sid, null, t);
      const mine = (x.j.roles || []).filter((r) => r.name === 'VERIFY ROLE');
      say('roles create+list', x.s === 200 && mine.length > 0, x.s + ' found=' + mine.length);
      for (const r of mine) { const d = await call('DELETE', '/custom-roles/' + r.id, null, t); say('role delete', d.s < 300, d.s); }
      x = await call('GET', '/schools/' + sid, null, t); const s = x.j.school || {};
      const p = s.subdomain ? (await call('GET', '/schools/subdomain/' + s.subdomain)).j.school || {} : {};
      say('branding: public data matches', !!s.subdomain && (p.tagline || '') === (s.tagline || ''), 'tagline=' + (s.tagline || '') + ' color=' + ((p.theme_config || {}).primary_color || 'none'));
      const uid = await mk('verify-student@example.com', 'student', sid);
      x = await call('POST', '/schools/users/' + uid + '/suspend', { reason: 'verify' }, t); say('suspend', x.s === 200, x.s);
      x = await call('POST', '/auth/login', { email: 'verify-student@example.com', password: 'OldPass123' }); say('suspended login blocked', x.s === 401 && /suspended/i.test(x.j.error || ''), x.s + ' ' + (x.j.error || ''));
      x = await call('POST', '/schools/users/' + uid + '/reactivate', {}, t); say('reactivate', x.s === 200, x.s);
      x = await call('POST', '/auth/login', { email: 'verify-student@example.com', password: 'OldPass123' }); say('reactivated login', x.s === 200, x.s);
    } else console.log('SKIP school admin checks (no school_admin login)');
    const id = await mk('verify-reset@example.com', 'student', sid);
    const k = await call('POST', '/auth/forgot-password', { email: 'verify-reset@example.com' });
    const n = await call('POST', '/auth/forgot-password', { email: 'nobody-' + Date.now() + '@example.com' });
    if (k.s === 429) console.log('SKIP identical-response check (rate limited, wait 15 min)');
    else say('reset request identical known/unknown', k.s === 200 && n.s === 200 && JSON.stringify(k.j) === JSON.stringify(n.j), k.s + '/' + n.s);
    let raw = await setTok(id, '1 hour'), y;
    y = await call('POST', '/auth/reset-password/validate', { token: raw }); say('validate good token', y.s === 200, y.s);
    y = await call('POST', '/auth/reset-password', { token: raw, password: 'abc12' }); say('weak password rejected', y.s === 400, y.s);
    y = await call('POST', '/auth/reset-password', { token: raw, password: 'NewPass456' }); say('reset ok', y.s === 200, y.s);
    y = await call('POST', '/auth/reset-password', { token: raw, password: 'NewPass789' }); say('token reuse rejected', y.s === 400, y.s);
    y = await call('POST', '/auth/login', { email: 'verify-reset@example.com', password: 'OldPass123' }); say('old password rejected', y.s === 401, y.s);
    y = await call('POST', '/auth/login', { email: 'verify-reset@example.com', password: 'NewPass456' }); say('new password works', y.s === 200, y.s);
    raw = await setTok(id, '-1 minute');
    y = await call('POST', '/auth/reset-password', { token: raw, password: 'NewPass999' }); say('expired token rejected', y.s === 400, y.s);
    const c = []; for (let i = 0; i < 8; i++) c.push((await call('POST', '/auth/forgot-password', { email: 'z' + i + '@example.com' })).s);
    const f = c.indexOf(429);
    say('rate limit fires and holds', f >= 0 && c.slice(f).every((v) => v === 429), c.join(' '));
    const sp = await fetch(B + '/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '9.9.9.9', 'True-Client-IP': '8.8.8.8' }, body: JSON.stringify({ email: 'q@example.com' }) });
    say('spoofed headers still limited', sp.status === 429, sp.status);
  } catch (e) { console.log('ERROR', e.message); }
  finally {
    await pool.query('DELETE FROM users WHERE id = ANY($1) AND full_name = $2', [made, NAME]);
    console.log('cleanup: removed ' + made.length + ' throwaway users');
    await pool.end();
  }
})();
