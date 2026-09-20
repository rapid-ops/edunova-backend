const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendGeneralNotification } = require('../services/whatsapp.service');

router.post('/', protect, authorize('super_admin','school_admin','teacher'), async (req, res) => {
  const { school_id, user_id, title, body, type, send_whatsapp } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO notifications (school_id, user_id, title, body, type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [school_id, user_id, title, body, type || 'general']
    );
    const notification = result.rows[0];
    const io = req.app.get('io');
    io.to(`user_${user_id}`).emit('new_notification', notification);

    if (send_whatsapp) {
      const userRes = await pool.query(`SELECT * FROM users WHERE id=$1`, [user_id]);
      const user = userRes.rows[0];
      if (user?.phone) {
        await sendGeneralNotification(user.phone, title, body);
      }
    }

    res.status(201).json({ notification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/broadcast', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { school_id, title, body, type, send_whatsapp } = req.body;
  try {
    const users = await pool.query(`SELECT * FROM users WHERE school_id=$1`, [school_id]);
    const io = req.app.get('io');
    const inserts = users.rows.map((u) =>
      pool.query(
        `INSERT INTO notifications (school_id, user_id, title, body, type)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [school_id, u.id, title, body, type || 'general']
      ).then(async (r) => {
        io.to(`user_${u.id}`).emit('new_notification', r.rows[0]);
        if (send_whatsapp && u.phone) {
          await sendGeneralNotification(u.phone, title, body);
        }
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
  try {
    await pool.query(`UPDATE notifications SET is_read=true WHERE user_id=$1`, [req.params.user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
