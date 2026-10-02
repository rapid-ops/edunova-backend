const router = require('express').Router();
const pool = require('../config/db');
const { protect } = require('../middleware/auth.middleware');
const { validId } = require('../utils/access');

const me = (req) => Number(req.user.id);

// Get all conversations for a user (your own inbox only)
router.get('/inbox/:user_id', protect, async (req, res) => {
  const { user_id } = req.params;
  if (!validId(user_id)) return res.status(404).json({ error: 'Not found' });
  if (Number(user_id) !== me(req)) return res.status(403).json({ error: 'Access denied' });
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (other_user)
        CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END as other_user,
        m.content, m.created_at, m.is_read,
        u.full_name, u.role
       FROM messages m
       JOIN users u ON u.id = CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END
       WHERE sender_id=$1 OR receiver_id=$1
       ORDER BY other_user, m.created_at DESC`,
      [user_id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get conversation between two users (only the two people in it)
router.get('/:user1/:user2', protect, async (req, res) => {
  const { user1, user2 } = req.params;
  if (!validId(user1) || !validId(user2)) return res.status(404).json({ error: 'Not found' });
  if (me(req) !== Number(user1) && me(req) !== Number(user2)) return res.status(403).json({ error: 'Access denied' });
  try {
    const result = await pool.query(
      `SELECT m.*,
        s.full_name as sender_name,
        r.full_name as receiver_name
       FROM messages m
       JOIN users s ON m.sender_id = s.id
       JOIN users r ON m.receiver_id = r.id
       WHERE (m.sender_id=$1 AND m.receiver_id=$2)
          OR (m.sender_id=$2 AND m.receiver_id=$1)
       ORDER BY m.created_at ASC`,
      [user1, user2]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark messages sent to you as read
router.patch('/read/:sender_id/:receiver_id', protect, async (req, res) => {
  const { sender_id, receiver_id } = req.params;
  if (!validId(sender_id) || !validId(receiver_id)) return res.status(404).json({ error: 'Not found' });
  if (Number(receiver_id) !== me(req)) return res.status(403).json({ error: 'Access denied' });
  try {
    await pool.query(
      `UPDATE messages SET is_read=true WHERE sender_id=$1 AND receiver_id=$2`,
      [sender_id, receiver_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
