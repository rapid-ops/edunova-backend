const pool = require('../config/db');
const { createFee, getFeesByStudent, getFeesBySchool, updateFeeStatus } = require('../models/fee.model');
const { validId, sameSchool, canSeeStudent } = require('../utils/access');

const create = async (req, res) => {
  try {
    const { student_id, amount, description, due_date } = req.body;
    if (!validId(student_id)) return res.status(400).json({ error: 'student_id and amount required' });
    const amt = Number(amount);
    if (amount === undefined || amount === null || amount === '' || !Number.isFinite(amt) || amt <= 0 || amt > 99999999) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    if (due_date && Number.isNaN(Date.parse(due_date))) return res.status(400).json({ error: 'Invalid due date' });
    const s = await pool.query(`SELECT id, role, school_id FROM users WHERE id=$1`, [student_id]);
    const st = s.rows[0];
    if (!st || st.role !== 'student') return res.status(404).json({ error: 'Student not found' });
    if (!sameSchool(req.user, st.school_id)) return res.status(403).json({ error: 'Access denied' });
    const fee = await createFee({
      school_id: st.school_id,
      student_id: st.id,
      amount: Math.round(amt * 100) / 100,
      description: description ? String(description).slice(0, 255) : null,
      due_date: due_date || null,
    });
    res.status(201).json({ fee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byStudent = async (req, res) => {
  try {
    const a = await canSeeStudent(req.user, req.params.student_id, ['school_admin']);
    if (a.error) return res.status(a.code).json({ error: a.error });
    res.json({ fees: await getFeesByStudent(a.student.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bySchool = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ fees: await getFeesBySchool(req.params.school_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const loadFee = async (req, res) => {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Fee not found' }); return null; }
  const r = await pool.query(`SELECT * FROM fees WHERE id=$1`, [req.params.id]);
  const fee = r.rows[0];
  if (!fee) { res.status(404).json({ error: 'Fee not found' }); return null; }
  if (!sameSchool(req.user, fee.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return fee;
};

const updateStatus = async (req, res) => {
  try {
    const fee = await loadFee(req, res);
    if (!fee) return;
    const { status } = req.body;
    if (!['pending', 'paid', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, paid or overdue' });
    }
    res.json({ fee: await updateFeeStatus(fee.id, status) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const fee = await loadFee(req, res);
    if (!fee) return;
    if (fee.status === 'paid') return res.status(400).json({ error: 'Paid fees cannot be deleted' });
    await pool.query(`DELETE FROM fees WHERE id=$1`, [fee.id]);
    res.json({ message: 'Fee deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, byStudent, bySchool, updateStatus, remove };
