const pool = require('../config/db');
const create = async ({ lesson_id, school_id, user_id, parent_id, content }) => {
  const r = await pool.query(`INSERT INTO discussions (lesson_id,school_id,user_id,parent_id,content) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [lesson_id, school_id, user_id, parent_id || null, content]);
  return r.rows[0];
};
const getByLesson = async (lesson_id) => {
  const r = await pool.query(`SELECT d.*,u.full_name,u.avatar_url FROM discussions d JOIN users u ON u.id=d.user_id WHERE d.lesson_id=$1 ORDER BY d.is_pinned DESC,d.upvotes DESC,d.created_at ASC`, [lesson_id]);
  return r.rows;
};
const upvote = async (discussion_id, user_id) => {
  try {
    await pool.query(`INSERT INTO discussion_upvotes (discussion_id,user_id) VALUES ($1,$2)`, [discussion_id, user_id]);
    await pool.query(`UPDATE discussions SET upvotes=upvotes+1 WHERE id=$1`, [discussion_id]);
    return { upvoted: true };
  } catch { 
    await pool.query(`DELETE FROM discussion_upvotes WHERE discussion_id=$1 AND user_id=$2`, [discussion_id, user_id]);
    await pool.query(`UPDATE discussions SET upvotes=GREATEST(upvotes-1,0) WHERE id=$1`, [discussion_id]);
    return { upvoted: false };
  }
};
const pin = async (id) => { const r = await pool.query(`UPDATE discussions SET is_pinned=NOT is_pinned WHERE id=$1 RETURNING *`, [id]); return r.rows[0]; };
const remove = async (id) => { await pool.query(`DELETE FROM discussions WHERE id=$1`, [id]); };
module.exports = { create, getByLesson, upvote, pin, remove };
