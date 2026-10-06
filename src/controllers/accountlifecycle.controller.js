const pool = require('../config/db');
const { sendEmail } = require('../services/email.service');
const { sameSchool, getUser } = require('../utils/access');

const suspend = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { reason } = req.body;
    const target = await getUser(user_id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!sameSchool(req.user, target.school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query(
      `UPDATE users SET suspended_at=NOW(), suspension_reason=$1, is_active=false WHERE id=$2`,
      [reason || null, user_id]
    );
    const userRow = await pool.query(`SELECT email, full_name FROM users WHERE id=$1`, [user_id]);
    const u = userRow.rows[0];
    if (u) {
      const schoolRow = await pool.query(`SELECT name FROM schools WHERE id=$1`, [target.school_id]);
      sendEmail(u.email, 'account_suspended', {
        name: u.full_name,
        reason: reason || 'No reason provided',
        school_name: schoolRow.rows[0]?.name || 'Your school',
      });
    }
    res.json({ message: 'Account suspended' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const reactivate = async (req, res) => {
  try {
    const { user_id } = req.params;
    const target = await getUser(user_id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!sameSchool(req.user, target.school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query(
      `UPDATE users SET suspended_at=NULL, suspension_reason=NULL, is_active=true WHERE id=$1`,
      [user_id]
    );
    const userRow = await pool.query(`SELECT email, full_name FROM users WHERE id=$1`, [user_id]);
    const u = userRow.rows[0];
    if (u) {
      const schoolRow = await pool.query(`SELECT name FROM schools WHERE id=$1`, [target.school_id]);
      sendEmail(u.email, 'account_reactivated', {
        name: u.full_name,
        school_name: schoolRow.rows[0]?.name || 'Your school',
      });
    }
    res.json({ message: 'Account reactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { suspend, reactivate };
