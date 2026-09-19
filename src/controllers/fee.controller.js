const { createFee, getFeesByStudent, getFeesBySchool, updateFeeStatus } = require('../models/fee.model');

const create = async (req, res) => {
  try {
    const { school_id, student_id, amount, description, due_date } = req.body;
    if (!school_id || !student_id || !amount) return res.status(400).json({ error: 'school_id, student_id and amount required' });
    const fee = await createFee({ school_id, student_id, amount, description, due_date });
    res.status(201).json({ fee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byStudent = async (req, res) => {
  try {
    const fees = await getFeesByStudent(req.params.student_id);
    res.json({ fees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bySchool = async (req, res) => {
  try {
    const fees = await getFeesBySchool(req.params.school_id);
    res.json({ fees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const fee = await updateFeeStatus(req.params.id, status);
    res.json({ fee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, byStudent, bySchool, updateStatus };
