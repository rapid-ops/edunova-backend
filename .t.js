const sp = require('speakeasy');
const B = 'https://edunova-backend-2x7h.onrender.com/api', E = 'parent@edunova.com', PW = process.env.PW;
const call = async (m, p, b, t) => {
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = 'Bearer ' + t;
  const r = await fetch(B + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => ({}));
  console.log(m, p, r.status, JSON.stringify(j).slice(0, 150));
  return j;
};
(async () => {
  const L = () => call('POST', '/auth/login', { email: E, password: PW });
  const l = await L(); if (!l.token) return;
  const e = await call('POST', '/mfa/enable', null, l.token); if (!e.secret) return;
  const c = () => sp.totp({ secret: e.secret, encoding: 'base32' });
  await call('POST', '/mfa/activate', { token: c() }, l.token);
  const l2 = await L();
  const v = await call('POST', '/mfa/verify-login', { partial_token: l2.partial_token, totp_token: c() });
  await call('POST', '/mfa/disable', { token: c() }, v.token);
  const l3 = await L();
  console.log('final login ok:', !!l3.token, '| secret:', e.secret);
})();
