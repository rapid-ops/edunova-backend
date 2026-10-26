// In-app notifications only. Same insert and live push as routes/notification.routes.js.
const notifyUsers = async (db, { school_id, user_ids, title, body, type }) => {
  if (!user_ids || !user_ids.length) return [];
  const r = await db.query(
    `INSERT INTO notifications (school_id, user_id, title, body, type)
     SELECT $1::int, u, $3::text, $4::text, $5::text FROM unnest($2::int[]) AS u RETURNING *`,
    [school_id, user_ids, String(title).slice(0, 255), body ? String(body).slice(0, 2000) : null, String(type || 'general').slice(0, 50)]
  );
  return r.rows;
};
const pushLive = (io, rows) => {
  if (!io) return;
  rows.forEach((n) => { try { io.to('user_' + n.user_id).emit('new_notification', n); } catch (e) { /* ignore */ } });
};
module.exports = { notifyUsers, pushLive };
