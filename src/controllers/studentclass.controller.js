const pool = require('../config/db');
const { getStudentsByClass, getClassesByStudent, removeStudentFromClass } = require('../models/studentclass.model');
const { validId, sameSchool, canSeeStudent, getUser, getClass } = require('../utils/access');
const T = require('../utils/teaching');

const fail = (res, err) => {
  if (err && err.plain) return res.status(400).json({ error: err.plain });
  console.error('student-class error:', err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const loadClass = async (req, res, id) => {
  const cls = await getClass(id);
  if (!cls) { res.status(404).json({ error: 'Class not found' }); return null; }
  if (!sameSchool(req.user, cls.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return cls;
};

// For changes: an admin of the school, or the teacher of this class
const loadManagedClass = async (req, res, id) => {
  const cls = await T.getClassFull(id);
  if (!cls) { res.status(404).json({ error: 'Class not found' }); return null; }
  if (!sameSchool(req.user, cls.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  if (!(await T.canManageClass(req.user, cls))) {
    res.status(403).json({ error: 'You can only change students in your own classes.' });
    return null;
  }
  return cls;
};

// Adds students inside a transaction, refusing to go over the class capacity
const addToClass = async (client, cls, ids) => {
  await client.query(`SELECT id FROM classes WHERE id=$1 FOR UPDATE`, [cls.id]);
  const cur = await client.query(`SELECT student_id FROM student_classes WHERE class_id=$1`, [cls.id]);
  const have = new Set(cur.rows.map((r) => r.student_id));
  const fresh = ids.filter((id) => !have.has(id));
  if (cls.capacity !== null && cls.capacity !== undefined && have.size + fresh.length > cls.capacity) {
    const room = Math.max(0, cls.capacity - have.size);
    const e = new Error('class full');
    e.plain = room === 0
      ? `This class is full (capacity ${cls.capacity}).`
      : `This class can hold ${cls.capacity} students and already has ${have.size}. You can add ${room} more.`;
    throw e;
  }
  let added = [];
  if (fresh.length) {
    const r = await client.query(
      `INSERT INTO student_classes (student_id, class_id, school_id)
       SELECT u, $2::int, $3::int FROM unnest($1::int[]) AS u
       ON CONFLICT (student_id, class_id) DO NOTHING RETURNING student_id`, [fresh, cls.id, cls.school_id]);
    added = r.rows.map((x) => x.student_id);
  }
  return { added, already: ids.length - fresh.length };
};

const enroll = async (req, res) => {
  try {
    const { student_id, class_id } = req.body || {};
    if (!validId(student_id) || !validId(class_id)) return res.status(400).json({ error: 'student_id and class_id required' });
    const cls = await loadManagedClass(req, res, class_id);
    if (!cls) return;
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(cls.school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    const out = await T.inTxn((c) => addToClass(c, cls, [st.id]));
    const sc = (await pool.query(`SELECT * FROM student_classes WHERE student_id=$1 AND class_id=$2`, [st.id, cls.id])).rows[0];
    if (out.added.length) return res.status(201).json({ enrollment: sc });
    res.json({ enrollment: sc, already_in_class: true, message: 'This student is already in this class.' });
  } catch (err) { fail(res, err); }
};

const bulkAdd = async (req, res) => {
  try {
    const { class_id, student_ids } = req.body || {};
    if (!validId(class_id)) return res.status(400).json({ error: 'Choose a class first.' });
    if (!Array.isArray(student_ids) || !student_ids.length) return res.status(400).json({ error: 'Choose at least one student.' });
    if (student_ids.length > T.MAX_BULK) return res.status(400).json({ error: `You can add at most ${T.MAX_BULK} students at a time.` });
    const cls = await loadManagedClass(req, res, class_id);
    if (!cls) return;
    const ids = await T.validStudents(T.cleanIds(student_ids), cls.school_id);
    const skipped = Math.max(0, student_ids.length - ids.length);
    const out = ids.length ? await T.inTxn((c) => addToClass(c, cls, ids)) : { added: [], already: 0 };
    const parts = [];
    if (out.added.length) parts.push(`${plural(out.added.length, 'student was', 'students were')} added.`);
    if (out.already) parts.push(`${plural(out.already, 'student was', 'students were')} already in this class.`);
    if (skipped) parts.push(`${plural(skipped, 'person', 'people')} could not be added.`);
    res.status(out.added.length ? 201 : 200).json({
      result: { added: out.added.length, already_in_class: out.already, skipped },
      message: parts.length ? parts.join(' ') : 'No students were added.',
    });
  } catch (err) { fail(res, err); }
};

const move = async (req, res) => {
  try {
    const { from_class_id, to_class_id, student_ids } = req.body || {};
    if (!validId(from_class_id) || !validId(to_class_id)) return res.status(400).json({ error: 'Choose the class to move students from and to.' });
    if (Number(from_class_id) === Number(to_class_id)) return res.status(400).json({ error: 'Choose two different classes.' });
    if (!Array.isArray(student_ids) || !student_ids.length) return res.status(400).json({ error: 'Choose at least one student.' });
    if (student_ids.length > T.MAX_BULK) return res.status(400).json({ error: `You can move at most ${T.MAX_BULK} students at a time.` });
    const from = await loadManagedClass(req, res, from_class_id);
    if (!from) return;
    const to = await loadManagedClass(req, res, to_class_id);
    if (!to) return;
    if (Number(from.school_id) !== Number(to.school_id)) return res.status(403).json({ error: 'Access denied' });
    const ids = T.cleanIds(student_ids);
    const moved = await T.inTxn(async (c) => {
      await c.query(`SELECT id FROM classes WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [[from.id, to.id]]);
      const del = await c.query(
        `DELETE FROM student_classes WHERE class_id=$1 AND student_id = ANY($2::int[]) RETURNING student_id`, [from.id, ids]);
      const list = del.rows.map((r) => r.student_id);
      if (list.length) await addToClass(c, to, list);
      return list.length;
    });
    const skipped = Math.max(0, student_ids.length - moved);
    res.json({
      result: { moved, skipped },
      message: `${plural(moved, 'student was', 'students were')} moved.` + (skipped ? ` ${plural(skipped, 'person was', 'people were')} not in the first class.` : ''),
    });
  } catch (err) { fail(res, err); }
};

const listByClass = async (req, res) => {
  try {
    const cls = await loadClass(req, res, req.params.class_id);
    if (!cls) return;
    res.json({ students: await getStudentsByClass(cls.id) });
  } catch (err) { fail(res, err); }
};

const listByStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ classes: await getClassesByStudent(access.student.id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.student_id)) return res.status(404).json({ error: 'Student not found' });
    const cls = await loadManagedClass(req, res, req.params.class_id);
    if (!cls) return;
    await removeStudentFromClass(req.params.student_id, cls.id);
    res.json({ message: 'Student removed from class' });
  } catch (err) { fail(res, err); }
};

// Students of the school who are not yet in this class (search by name or email)
const candidates = async (req, res) => {
  try {
    const cls = await loadManagedClass(req, res, req.params.class_id);
    if (!cls) return;
    const r = await pool.query(
      `SELECT u.id, u.full_name, u.email,
              (SELECT string_agg(c2.name, ', ') FROM student_classes s2 JOIN classes c2 ON c2.id=s2.class_id WHERE s2.student_id=u.id) AS class_names
       FROM users u
       WHERE u.school_id=$1 AND u.role='student' AND u.is_active IS NOT FALSE AND u.approval_status='approved'
         AND NOT EXISTS (SELECT 1 FROM student_classes s WHERE s.student_id=u.id AND s.class_id=$2)
         AND ($3::text = '' OR u.full_name ILIKE '%'||$3::text||'%' OR u.email ILIKE '%'||$3::text||'%')
       ORDER BY u.full_name LIMIT 50`,
      [cls.school_id, cls.id, T.likeText(req.query.q)]);
    res.json({ students: r.rows });
  } catch (err) { fail(res, err); }
};

module.exports = { enroll, bulkAdd, move, listByClass, listByStudent, remove, candidates };
