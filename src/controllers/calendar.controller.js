const pool = require('../config/db');
const { validId, sameSchool, schoolForCreate } = require('../utils/access');
const fail = (res, err) => res.status(500).json({ error: err.message });

const TYPES = ['term','holiday','exam'];
const COLORS = /^#[0-9a-fA-F]{6}$/;

const create = async (req, res) => {
  try {
    const { title, start_date, end_date, type, color } = req.body;
    if (!title || !String(title).trim() || !start_date || !end_date)
      return res.status(400).json({ error: 'title, start_date and end_date required' });
    if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'type must be term, holiday or exam' });
    if (color && !COLORS.test(color)) return res.status(400).json({ error: 'color must be a hex code' });
    const school_id = schoolForCreate(req, res);
    if (school_id === null) return;
    const r = await pool.query(
      `INSERT INTO academic_calendar (school_id,title,start_date,end_date,type,color)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [school_id, String(title).trim().slice(0,255), start_date, end_date,
       type || 'term', color || '#2563eb']);
    res.status(201).json({ event: r.rows[0] });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `SELECT * FROM academic_calendar WHERE school_id=$1 ORDER BY start_date ASC`,
      [req.params.school_id]);
    res.json({ events: r.rows });
  } catch (err) { fail(res, err); }
};

const update = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Event not found' });
    const ev = await pool.query(`SELECT school_id FROM academic_calendar WHERE id=$1`, [req.params.id]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found' });
    if (!sameSchool(req.user, ev.rows[0].school_id)) return res.status(403).json({ error: 'Access denied' });
    const { title, start_date, end_date, type, color } = req.body;
    if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (color && !COLORS.test(color)) return res.status(400).json({ error: 'Invalid color' });
    const r = await pool.query(
      `UPDATE academic_calendar
       SET title=COALESCE($2,title), start_date=COALESCE($3,start_date),
           end_date=COALESCE($4,end_date), type=COALESCE($5,type), color=COALESCE($6,color)
       WHERE id=$1 RETURNING *`,
      [req.params.id, title||null, start_date||null, end_date||null, type||null, color||null]);
    res.json({ event: r.rows[0] });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Event not found' });
    const ev = await pool.query(`SELECT school_id FROM academic_calendar WHERE id=$1`, [req.params.id]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found' });
    if (!sameSchool(req.user, ev.rows[0].school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query(`DELETE FROM academic_calendar WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, update, remove };
