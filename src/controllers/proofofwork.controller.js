const pool = require('../config/db');
const create = async (req, res) => {
  try {
    const { course_id, title, description, competency_id } = req.body;
    if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required' });
    const r = await pool.query(
      `INSERT INTO proof_of_work_tasks (course_id,teacher_id,title,description,competency_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [course_id, req.user.id, title, description, competency_id || null]
    );
    res.status(201).json({ task: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const submitEvidence = async (req, res) => {
  try {
    const { file_url, description } = req.body;
    const r = await pool.query(
      `INSERT INTO proof_of_work_submissions (task_id,student_id,file_url,description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, file_url || null, description || null]
    );
    res.status(201).json({ submission: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const verify = async (req, res) => {
  try {
    const sub = await pool.query(
      `SELECT pws.*,pwt.competency_id FROM proof_of_work_submissions pws
       JOIN proof_of_work_tasks pwt ON pwt.id=pws.task_id WHERE pws.id=$1`,
      [req.params.id]
    );
    if (!sub.rows[0]) return res.status(404).json({ error: 'Submission not found' });
    await pool.query(
      `UPDATE proof_of_work_submissions SET verified=true,verified_at=NOW(),verified_by=$1 WHERE id=$2`,
      [req.user.id, req.params.id]
    );
    if (sub.rows[0].competency_id) {
      await pool.query(
        `INSERT INTO student_competencies (student_id,competency_id,awarded_by,evidence) VALUES ($1,$2,$3,'proof_of_work') ON CONFLICT DO NOTHING`,
        [sub.rows[0].student_id, sub.rows[0].competency_id, req.user.id]
      );
    }
    res.json({ message: 'Verified and competency awarded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const listByCourse = async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM proof_of_work_tasks WHERE course_id=$1 ORDER BY created_at DESC`, [req.params.course_id]);
    res.json({ tasks: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
module.exports = { create, submitEvidence, verify, listByCourse };
