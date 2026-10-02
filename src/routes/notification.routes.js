const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendGeneralNotification } = require('../services/whatsapp.service');
const { validId, sameSchool, getUser } = require('../utils/access');

const isMe = (req, id) => validId(id) && Number(req.user.id) === Number(id);
const whatsapp = async (phone, title, body) => {
  try { await sendGeneralNotification(phone, title, body); } catch (e) { console.error('WhatsApp failed:', e.message); }
};

router.post('/', protect, authorize('super_admin','school_admin','teacher'), async (req, res) => {
  const { user_id, title, body, type, send_whatsapp } = req.body;
  try {
    if (!validId(user_id) || !title || !String(title).trim()) {
      return res.status(400).json({ error: 'user_id and title required' });
    }
    const target = await getUser(user_id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!sameSchool(req.user, target.school_id)) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `INSERT INTO notifications (school_id, user_id, title, body, type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [target.school_id, target.id, String(title).trim().slice(0, 255), body ? String(body).slice(0, 2000) : null, String(type || 'general').slice(0, 50)]
    );
    const notification = result.rows[0];
    const io = req.app.get('io');
    if (io) io.to(`user_${target.id}`).emit('new_notification', notification);

    if (send_whatsapp) {
      const u = await pool.query(`SELECT phone FROM users WHERE id=$1`, [target.id]);
      if (u.rows[0] && u.rows[0].phone) await whatsapp(u.rows[0].phone, notification.title, notification.body);
    }
    res.status(201).json({ notification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/broadcast', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { title, body, type, send_whatsapp } = req.body;
  try {
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const users = await pool.query(`SELECT id, phone FROM users WHERE school_id=$1`, [school_id]);
    const io = req.app.get('io');
    const inserts = users.rows.map((u) =>
      pool.query(
        `INSERT INTO notifications (school_id, user_id, title, body, type)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [school_id, u.id, String(title).trim().slice(0, 255), body ? String(body).slice(0, 2000) : null, String(type || 'general').slice(0, 50)]
      ).then(async (r) => {
        if (io) io.to(`user_${u.id}`).emit('new_notification', r.rows[0]);
        if (send_whatsapp && u.phone) await whatsapp(u.phone, r.rows[0].title, r.rows[0].body);
        return r.rows[0];
      })
    );
    const notifications = await Promise.all(inserts);
    res.status(201).json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:user_id', protect, async (req, res) => {
  if (!isMe(req, req.params.user_id)) return res.status(validId(req.params.user_id) ? 403 : 404).json({ error: 'Access denied' });
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.user_id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/read/:user_id', protect, async (req, res) => {
  if (!isMe(req, req.params.user_id)) return res.status(validId(req.params.user_id) ? 403 : 404).json({ error: 'Access denied' });
  try {
    await pool.query(`UPDATE notifications SET is_read=true WHERE user_id=$1`, [req.params.user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
