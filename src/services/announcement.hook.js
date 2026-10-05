const pool = require('../config/db');
const { sendWhatsApp } = require('./whatsapp.service');

const notifyAnnouncement = async ({ school_id, title, body, target_roles = [] }) => {
  try {
    let query = `SELECT phone FROM users WHERE school_id=$1 AND phone IS NOT NULL`;
    const params = [school_id];
    if (target_roles.length) {
      query += ` AND role = ANY($2)`;
      params.push(target_roles);
    }
    const schoolRes = await pool.query('SELECT name FROM schools WHERE id=$1', [school_id]);
    const schoolName = schoolRes.rows[0]?.name || 'School';
    const users = await pool.query(query, params);
    for (const u of users.rows) {
      sendWhatsApp(u.phone, `📢 ${schoolName}\n${title}\n\n${body}`);
    }
  } catch (e) {
    console.error('Announcement WhatsApp error:', e.message);
  }
};

module.exports = { notifyAnnouncement };
