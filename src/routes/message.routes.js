const router = require('express').Router();
const pool = require('../config/db');
const { protect } = require('../middleware/auth.middleware');
const { validId } = require('../utils/access');

const me = (req) => Number(req.user.id);

router.get('/inbox/:user_id', protect, async (req, res) => {
  const { user_id } = req.params;
  if (!validId(user_id)) return res.status(404).json({ error: 'Not found' });
  if (Number(user_id) !== me(req)) return res.status(403).json({ error: 'Access denied' });
  try {
    const result = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (other_user)
           CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END AS other_user,
           m.content, m.created_at, m.is_read, m.sender_id,
           u.full_name, u.role,
           (SELECT COUNT(*)::int FROM messages x WHERE x.sender_id=u.id AND x.receiver_id=$1 AND x.is_read IS NOT TRUE) AS unread_count
         FROM messages m
         JOIN users u ON u.id = CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END
         WHERE m.sender_id=$1 OR m.receiver_id=$1
         ORDER BY other_user, m.created_at DESC
       ) t ORDER BY created_at DESC`,
      [me(req)]
    );
    res.json({ conversations: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:user1/:user2', protect, async (req, res) => {
  const { user1, user2 } = req.params;
  if (!validId(user1) || !validId(user2)) return res.status(404).json({ error: 'Not found' });
  if (me(req) !== Number(user1) && me(req) !== Number(user2)) return res.status(403).json({ error: 'Access denied' });
  try {
    const result = await pool.query(
      `SELECT m.*, s.full_name as sender_name, r.full_name as receiver_name
       FROM messages m
       JOIN users s ON m.sender_id = s.id
       JOIN users r ON m.receiver_id = r.id
       WHERE (m.sender_id=$1 AND m.receiver_id=$2) OR (m.sender_id=$2 AND m.receiver_id=$1)
       ORDER BY m.created_at ASC`,
      [user1, user2]
    );
    res.json({ messages: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/read/:sender_id/:receiver_id', protect, async (req, res) => {
  const { sender_id, receiver_id } = req.params;
  if (!validId(sender_id) || !validId(receiver_id)) return res.status(404).json({ error: 'Not found' });
  if (Number(receiver_id) !== me(req)) return res.status(403).json({ error: 'Access denied' });
  try {
    await pool.query(`UPDATE messages SET is_read=true WHERE sender_id=$1 AND receiver_id=$2`, [sender_id, receiver_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', protect, async (req, res) => {
  const { receiver_id, content } = req.body;
  if (!validId(receiver_id)) return res.status(400).json({ error: 'receiver_id required' });
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text || text.length > 2000) return res.status(400).json({ error: 'content required (max 2000)' });
  try {
    const r = await pool.query(`SELECT id, school_id FROM users WHERE id=$1`, [receiver_id]);
    const receiver = r.rows[0];
    if (!receiver) return res.status(404).json({ error: 'Receiver not found' });
    const sender = req.user;
    if (sender.role !== 'super_admin' && (sender.school_id == null || Number(receiver.school_id) !== Number(sender.school_id))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `INSERT INTO messages (school_id, sender_id, receiver_id, content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [receiver.school_id, sender.id, receiver.id, text]
    );
    const message = result.rows[0];
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${receiver.id}`).emit('new_message', message);
      io.to(`user_${sender.id}`).emit('new_message', message);
    }
    res.status(201).json({ message });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


const OK = `(u.approval_status IS NULL OR u.approval_status='approved')`;
const teachersOf = (kids) => `
    OR u.id IN (SELECT c.teacher_id FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.student_id ${kids})
    OR u.id IN (SELECT ca.teacher_id FROM course_assignments ca JOIN enrollments e ON e.course_id=ca.course_id WHERE e.student_id ${kids})
    OR u.id IN (SELECT cl.teacher_id FROM classes cl JOIN student_classes sc ON sc.class_id=cl.id WHERE sc.student_id ${kids})
    OR u.id IN (SELECT c.teacher_id FROM courses c JOIN student_classes sc ON sc.class_id=c.class_id WHERE sc.student_id ${kids})`;
const head = `SELECT u.id, u.full_name, u.role FROM users u WHERE u.school_id=$2 AND u.id<>$1 AND ${OK}`;
const contactSql = {
  student: `${head} AND (u.role='school_admin' ${teachersOf('=$1')}) ORDER BY u.full_name`,
  parent: `WITH kids AS (SELECT student_id AS id FROM parent_student WHERE parent_id=$1)
    ${head} AND (u.role='school_admin' ${teachersOf('IN (SELECT id FROM kids)')}) ORDER BY u.full_name`,
  teacher: `WITH ms AS (
      SELECT e.student_id AS id FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE c.teacher_id=$1
      UNION SELECT e.student_id FROM enrollments e JOIN course_assignments ca ON ca.course_id=e.course_id WHERE ca.teacher_id=$1
      UNION SELECT sc.student_id FROM student_classes sc JOIN classes cl ON cl.id=sc.class_id WHERE cl.teacher_id=$1
      UNION SELECT sc.student_id FROM student_classes sc JOIN courses c ON c.class_id=sc.class_id WHERE c.teacher_id=$1)
    ${head} AND (u.role='school_admin' OR u.id IN (SELECT id FROM ms)
      OR u.id IN (SELECT ps.parent_id FROM parent_student ps WHERE ps.student_id IN (SELECT id FROM ms))) ORDER BY u.full_name`,
  admin: `${head} ORDER BY u.full_name LIMIT 500`,
};

router.get('/contacts', protect, async (req, res) => {
  try {
    const u = req.user;
    const key = u.role === 'school_admin' ? 'admin' : u.role;
    if (!contactSql[key] || u.school_id == null) return res.json({ contacts: [] });
    const r = await pool.query(contactSql[key], [u.id, u.school_id]);
    res.json({ contacts: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
