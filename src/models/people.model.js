const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const PLACEHOLDER = '@no-email.invalid';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_DAYS = 30;
const LINK_DAYS = 7;
const LOCK_KEY = 7;
const ROLES = ['student', 'teacher', 'parent'];

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const appUrl = () => {
  const u = process.env.FRONTEND_URL;
  return u && !/localhost|127\.0\.0\.1/.test(u) ? u.replace(/\/+$/, '') : 'https://edunova-frontend-gkaj.vercel.app';
};
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const newToken = () => crypto.randomBytes(32).toString('hex');
const isPlaceholder = (e) => String(e || '').toLowerCase().endsWith(PLACEHOLDER);
const inviteLink = (raw) => appUrl() + '/auth/reset-password?token=' + raw;
const shape = (r) => (r ? { ...r, email: isPlaceholder(r.email) ? null : r.email, has_email: !isPlaceholder(r.email) } : r);

const STATUS = `CASE
  WHEN u.suspended_at IS NOT NULL THEN 'suspended'
  WHEN u.approval_status = 'pending' THEN 'pending'
  WHEN u.invited_at IS NOT NULL AND u.password_set_at IS NULL THEN 'invited'
  ELSE 'active' END`;
const COLS = `u.id, u.school_id, u.full_name, u.email, u.phone, u.role, u.login_id, u.created_at, u.suspension_reason,
  ${STATUS} AS status,
  (u.must_change_password AND u.temp_password_expires IS NOT NULL AND u.temp_password_expires < NOW()) AS code_expired,
  u.temp_password_expires AS code_expires_at`;
const LINK_SQL = `INSERT INTO parent_student (parent_id, student_id)
  SELECT $1::int, $2::int WHERE NOT EXISTS (SELECT 1 FROM parent_student WHERE parent_id = $1::int AND student_id = $2::int)`;

const schoolName = async (id) => {
  const r = await pool.query('SELECT name FROM schools WHERE id = $1', [id]);
  return (r.rows[0] && r.rows[0].name && r.rows[0].name.trim()) || 'Your school';
};

const getOne = async (id) => {
  const r = await pool.query(`SELECT ${COLS} FROM users u WHERE u.id = $1`, [id]);
  return shape(r.rows[0]);
};

const list = async (school_id, { q, role, status, page, limit }) => {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const base = ['u.school_id = $1', "u.role IN ('student','teacher','parent')", "u.approval_status <> 'rejected'"];
  const args = [school_id];
  if (ROLES.includes(role)) { args.push(role); base.push(`u.role = $${args.length}`); }
  const baseWhere = base.join(' AND ');
  const baseArgs = args.slice();
  const where = base.slice();
  if (q && String(q).trim()) {
    args.push('%' + String(q).trim().slice(0, 100).replace(/[\\%_]/g, '\\$&') + '%');
    where.push(`(u.full_name ILIKE $${args.length} OR u.email ILIKE $${args.length} OR u.login_id ILIKE $${args.length})`);
  }
  if (['active', 'invited', 'pending', 'suspended'].includes(status)) {
    args.push(status);
    where.push(`${STATUS} = $${args.length}`);
  }
  const w = where.join(' AND ');
  const [rows, total, sum] = await Promise.all([
    pool.query(`SELECT ${COLS} FROM users u WHERE ${w} ORDER BY u.created_at DESC, u.id DESC LIMIT ${lim} OFFSET ${(pg - 1) * lim}`, args),
    pool.query(`SELECT COUNT(*)::int AS n FROM users u WHERE ${w}`, args),
    pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE st = 'active')::int AS active,
        COUNT(*) FILTER (WHERE st = 'invited')::int AS invited,
        COUNT(*) FILTER (WHERE st = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE st = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new_30d
      FROM (SELECT ${STATUS} AS st, u.created_at FROM users u WHERE ${baseWhere}) x`, baseArgs),
  ]);
  return { people: rows.rows.map(shape), total: total.rows[0].n, page: pg, limit: lim, summary: sum.rows[0] };
};

const detail = async (p) => {
  const out = { ...p };
  if (p.role === 'student') {
    const r = await pool.query(
      `SELECT x.id, x.full_name, x.email, x.phone FROM parent_student ps JOIN users x ON x.id = ps.parent_id WHERE ps.student_id = $1 ORDER BY x.full_name`, [p.id]);
    out.parents = r.rows.map(shape);
    try {
      const a = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'present')::int AS present, COUNT(*) FILTER (WHERE status = 'late')::int AS late, COUNT(*) FILTER (WHERE status = 'absent')::int AS absent FROM attendance WHERE student_id = $1`, [p.id]);
      const x = a.rows[0];
      const t = x.present + x.late + x.absent;
      out.attendance_rate = t ? Math.round(((x.present + x.late) / t) * 100) : null;
    } catch (e) { out.attendance_rate = null; }
    try {
      const s = await pool.query(
        `SELECT AVG(r.score::numeric / NULLIF(a.total_marks::numeric, 0) * 100) AS avg FROM results r JOIN assessments a ON a.id = r.assessment_id WHERE r.student_id = $1`, [p.id]);
      out.average_score = s.rows[0].avg == null ? null : Math.round(Number(s.rows[0].avg));
    } catch (e) { out.average_score = null; }
  } else if (p.role === 'parent') {
    const r = await pool.query(
      `SELECT x.id, x.full_name FROM parent_student ps JOIN users x ON x.id = ps.student_id WHERE ps.parent_id = $1 ORDER BY x.full_name`, [p.id]);
    out.children = r.rows;
  }
  return out;
};

const lookupEmail = async (db, email) => {
  const r = await db.query('SELECT id, full_name, role, school_id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
  return r.rows[0] || null;
};

const nextLoginId = async (client, school_id, role) => {
  const r = await client.query(
    `SELECT COALESCE(MAX(substring(login_id from '[0-9]+$')::int), 0) + 1 AS n FROM users WHERE school_id = $1 AND role = $2 AND login_id IS NOT NULL`,
    [school_id, role]);
  return `EDU${school_id}-${role === 'teacher' ? 'T' : 'S'}${String(r.rows[0].n).padStart(4, '0')}`;
};

const insertPerson = async (client, { school_id, role, full_name, email, phone, cost }) => {
  const login = role === 'student' || role === 'teacher';
  let login_id = null;
  let code = null;
  let hash;
  if (login) {
    login_id = await nextLoginId(client, school_id, role);
    code = newCode();
    hash = await bcrypt.hash(code, cost || 10);
  } else {
    hash = await bcrypt.hash(newToken(), cost ? 4 : 10);
  }
  const address = email || `${login_id.toLowerCase()}${PLACEHOLDER}`;
  const r = await client.query(
    `INSERT INTO users (school_id, full_name, email, password, role, phone, approval_status, login_id, must_change_password, temp_password_expires, invited_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8, CASE WHEN $8 THEN NOW() + INTERVAL '${CODE_DAYS} days' END, NOW())
     RETURNING id, school_id, full_name, email, phone, role, login_id, temp_password_expires`,
    [school_id, full_name, address, hash, role, phone, login_id, login]);
  let raw = null;
  if (!login) {
    raw = newToken();
    await client.query(
      `UPDATE users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '${LINK_DAYS} days' WHERE id = $2`, [sha(raw), r.rows[0].id]);
  }
  const { temp_password_expires, ...safe } = shape(r.rows[0]);
  return { user: { ...safe, status: 'invited' }, login_id, code, expires_at: temp_password_expires, link: raw ? inviteLink(raw) : null };
};

const attachParent = async (client, school_id, student_id, parent, cost) => {
  const found = await lookupEmail(client, parent.email);
  let pid;
  let created = null;
  if (found) {
    if (Number(found.school_id) !== Number(school_id)) return { error: 'other' };
    if (found.role !== 'parent') return { error: 'notparent' };
    pid = found.id;
  } else {
    created = await insertPerson(client, { school_id, role: 'parent', full_name: parent.full_name, email: parent.email, phone: parent.phone, cost });
    pid = created.user.id;
  }
  await client.query(LINK_SQL, [pid, student_id]);
  return { id: pid, full_name: found ? found.full_name : parent.full_name, created: !!created, email: parent.email, link: created ? created.link : null };
};

const createPerson = async ({ school_id, role, full_name, email, phone, parent }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [school_id, LOCK_KEY]);
    if (email) {
      const d = await lookupEmail(client, email);
      if (d) {
        await client.query('ROLLBACK');
        return { duplicate: Number(d.school_id) === Number(school_id) ? 'same' : 'other', existing: d };
      }
    }
    const main = await insertPerson(client, { school_id, role, full_name, email, phone });
    let parentOut = null;
    if (role === 'student' && parent) {
      parentOut = await attachParent(client, school_id, main.user.id, parent);
      if (parentOut.error) { await client.query('ROLLBACK'); return { parentError: parentOut.error }; }
    }
    await client.query('COMMIT');
    return { main, parent: parentOut };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (x) { /* ignore */ }
    if (e.code === '23505') {
      const d = await lookupEmail(pool, email || (parent && parent.email) || '');
      return { duplicate: d && Number(d.school_id) === Number(school_id) ? 'same' : 'other', existing: d };
    }
    throw e;
  } finally { client.release(); }
};

const reinvite = async (p) => {
  if (p.role === 'parent') {
    const raw = newToken();
    await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '${LINK_DAYS} days', invited_at = NOW() WHERE id = $2`, [sha(raw), p.id]);
    return { link: inviteLink(raw) };
  }
  const code = newCode();
  const hash = await bcrypt.hash(code, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [p.school_id, LOCK_KEY]);
    const login_id = p.login_id || (await nextLoginId(client, p.school_id, p.role));
    const r = await client.query(
      `UPDATE users SET password = $1, must_change_password = true, temp_password_expires = NOW() + INTERVAL '${CODE_DAYS} days',
         invited_at = NOW(), password_set_at = NULL, login_attempts = 0, locked_until = NULL, login_id = $2 WHERE id = $3
       RETURNING temp_password_expires`, [hash, login_id, p.id]);
    await client.query('COMMIT');
    return { login_id, code, expires_at: r.rows[0].temp_password_expires };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (x) { /* ignore */ }
    throw e;
  } finally { client.release(); }
};

const updatePerson = async (id, fields) => {
  const sets = [];
  const args = [];
  if ('full_name' in fields) { args.push(fields.full_name); sets.push(`full_name = $${args.length}`); }
  if ('phone' in fields) { args.push(fields.phone); sets.push(`phone = $${args.length}`); }
  if (!sets.length) return false;
  args.push(id);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${args.length}`, args);
  return true;
};

const linkParent = async (student, { parent_id, parent }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [student.school_id, LOCK_KEY]);
    let out;
    if (parent_id != null) {
      const r = await client.query('SELECT id, full_name, role, school_id FROM users WHERE id = $1', [parent_id]);
      const f = r.rows[0];
      if (!f || f.role !== 'parent') out = { error: 'notfound' };
      else if (Number(f.school_id) !== Number(student.school_id)) out = { error: 'forbidden' };
      else {
        await client.query(LINK_SQL, [f.id, student.id]);
        out = { id: f.id, full_name: f.full_name, created: false, email: null, link: null };
      }
    } else {
      out = await attachParent(client, student.school_id, student.id, parent);
    }
    await client.query(out.error ? 'ROLLBACK' : 'COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (x) { /* ignore */ }
    throw e;
  } finally { client.release(); }
};

const unlinkParent = (parent_id, student_id) =>
  pool.query('DELETE FROM parent_student WHERE parent_id = $1 AND student_id = $2', [parent_id, student_id]);

const PENDING = `u.school_id = $1 AND u.role = 'parent' AND u.approval_status = 'approved' AND u.suspended_at IS NULL
  AND u.invited_at IS NOT NULL AND u.password_set_at IS NULL AND u.invite_emailed_at IS NULL
  AND u.email NOT LIKE '%${PLACEHOLDER}'`;

const markEmailed = (id, ok = true) =>
  pool.query('UPDATE users SET invite_tried_at = NOW(), invite_emailed_at = CASE WHEN $2::boolean THEN NOW() ELSE invite_emailed_at END WHERE id = $1', [id, ok]);

const pendingList = async (school_id, limit) => {
  const r = await pool.query(`SELECT u.id, u.full_name, u.email, u.school_id, u.role FROM users u WHERE ${PENDING} ORDER BY u.invite_tried_at NULLS FIRST, u.id LIMIT ${Math.min(Number(limit) || 20, 20)}`, [school_id]);
  return r.rows;
};

const pendingCount = async (school_id) => {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM users u WHERE ${PENDING}`, [school_id]);
  return r.rows[0].n;
};

module.exports = { ROLES, schoolName, getOne, list, detail, createPerson, reinvite, updatePerson, linkParent, unlinkParent, insertPerson, attachParent, markEmailed, pendingList, pendingCount };
