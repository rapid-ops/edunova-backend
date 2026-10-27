const pool = require('../config/db');
const { newCode, hashCode, codeMatches } = require('../utils/codes');
const { sendEmail } = require('./email.service');

const MAX_ATTEMPTS = 5;
const COOLDOWN_SEC = 60;
const MAX_SENDS_PER_HOUR = 5;
const lc = (e) => String(e || '').trim().toLowerCase();
const SEND_FAILED = { ok: false, status: 502, error: 'We could not send the confirmation email. Please check the address and try again in a minute.' };

const sweep = async () => {
  try {
    await pool.query("DELETE FROM signup_verifications WHERE created_at < NOW() - INTERVAL '7 days'");
    await pool.query("DELETE FROM signup_email_sends WHERE sent_at < NOW() - INTERVAL '2 hours'");
    await pool.query("DELETE FROM users WHERE approval_status='unverified' AND created_at < NOW() - INTERVAL '7 days'");
  } catch (e) { console.error('Signup cleanup error:', e.message); }
};

const sendAllowance = async (email) => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(sent_at)))), 99999)::int AS since
     FROM signup_email_sends WHERE email_lc=$1 AND sent_at > NOW() - INTERVAL '1 hour'`, [lc(email)]);
  const { n, since } = r.rows[0];
  if (n > 0 && since < COOLDOWN_SEC) {
    const wait = COOLDOWN_SEC - since;
    return { ok: false, status: 429, wait, error: `Please wait ${wait} seconds before asking for another code.` };
  }
  if (n >= MAX_SENDS_PER_HOUR) return { ok: false, status: 429, wait: 3600, error: 'You have asked for too many codes. Please try again in an hour.' };
  return { ok: true };
};

const deliver = async (email, code) => {
  try { return !!(await sendEmail(email, 'verification_code', { code })); }
  catch (e) { console.error('Code email error:', e.message); return false; }
};

// Replace any earlier pending record for this email and send a fresh code.
const issue = async ({ email, purpose, payload }) => {
  sweep();
  const allowed = await sendAllowance(email);
  if (!allowed.ok) return allowed;
  const code = newCode();
  const client = await pool.connect();
  let id;
  try {
    await client.query('BEGIN');
    await client.query('UPDATE signup_verifications SET used_at = NOW() WHERE lower(email)=$1 AND purpose=$2 AND used_at IS NULL', [lc(email), purpose]);
    const r = await client.query(
      "INSERT INTO signup_verifications (purpose, email, code_hash, payload, expires_at) VALUES ($1,$2,$3,$4::jsonb, NOW() + INTERVAL '15 minutes') RETURNING id",
      [purpose, email.trim(), hashCode(email, code), JSON.stringify(payload || {})]);
    id = r.rows[0].id;
    await client.query('INSERT INTO signup_email_sends (email_lc, purpose) VALUES ($1,$2)', [lc(email), purpose]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
  if (!(await deliver(email.trim(), code))) {
    await pool.query('DELETE FROM signup_verifications WHERE id=$1', [id]).catch(() => {});
    await pool.query('DELETE FROM signup_email_sends WHERE id = (SELECT id FROM signup_email_sends WHERE email_lc=$1 ORDER BY id DESC LIMIT 1)', [lc(email)]).catch(() => {});
    return SEND_FAILED;
  }
  return { ok: true, id };
};

// New code for the pending record already on file (same details, fresh 15 minutes).
const resend = async ({ email, purpose }) => {
  const r = await pool.query(
    "SELECT id, attempts FROM signup_verifications WHERE lower(email)=$1 AND purpose=$2 AND used_at IS NULL AND created_at > NOW() - INTERVAL '24 hours' ORDER BY id DESC LIMIT 1",
    [lc(email), purpose]);
  const row = r.rows[0];
  if (!row) return { ok: false, status: 404, code: 'NO_REGISTRATION', error: 'We could not find a pending registration for this email. Please start again.' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, status: 400, code: 'LOCKED', error: 'Too many wrong codes. Please start again.' };
  const allowed = await sendAllowance(email);
  if (!allowed.ok) return allowed;
  const code = newCode();
  if (!(await deliver(email.trim(), code))) return SEND_FAILED;
  await pool.query("UPDATE signup_verifications SET code_hash=$2, expires_at = NOW() + INTERVAL '15 minutes', attempts = 0, last_sent_at = NOW() WHERE id=$1", [row.id, hashCode(email, code)]);
  await pool.query('INSERT INTO signup_email_sends (email_lc, purpose) VALUES ($1,$2)', [lc(email), purpose]);
  return { ok: true };
};

// Run inside a transaction. A wrong code returns commit:true so the attempt is still saved.
const check = async (client, { email, purpose, code }) => {
  const r = await client.query(
    `SELECT id, code_hash, payload, attempts, (expires_at < NOW()) AS expired FROM signup_verifications
     WHERE lower(email)=$1 AND purpose=$2 AND used_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`, [lc(email), purpose]);
  const row = r.rows[0];
  if (!row) return { ok: false, status: 404, code: 'NO_REGISTRATION', error: 'We could not find a pending registration for this email. Please start again.' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, status: 400, code: 'LOCKED', error: 'Too many wrong codes. Please start again.' };
  if (row.expired) return { ok: false, status: 400, code: 'EXPIRED', error: 'This code has expired. Please ask for a new code.' };
  if (!codeMatches(email, code, row.code_hash)) {
    const u = await client.query('UPDATE signup_verifications SET attempts = attempts + 1 WHERE id=$1 RETURNING attempts', [row.id]);
    const left = MAX_ATTEMPTS - u.rows[0].attempts;
    return { ok: false, commit: true, status: 400, code: left > 0 ? 'WRONG_CODE' : 'LOCKED',
      error: left > 0 ? `That code is not correct. You have ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code is not correct and you have no tries left. Please start again.' };
  }
  return { ok: true, row };
};
const consume = (client, id) => client.query('UPDATE signup_verifications SET used_at = NOW() WHERE id=$1', [id]);

module.exports = { issue, resend, check, consume, sendAllowance, MAX_ATTEMPTS, COOLDOWN_SEC };
