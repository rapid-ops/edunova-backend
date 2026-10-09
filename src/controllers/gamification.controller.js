const { validId } = require('../utils/access');
const gam = require('../models/gamification.model');

const getProfile = async (req, res) => {
  const { student_id } = req.params;
  if (!validId(student_id)) return res.status(400).json({ error: 'Invalid student_id' });
  try {
    const profile = await gam.getProfile(student_id);
    res.json({ profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const getLeaderboard = async (req, res) => {
  const { school_id } = req.params;
  const { period = 'all_time' } = req.query;
  if (!validId(school_id)) return res.status(400).json({ error: 'Invalid school_id' });
  try {
    const entries = await gam.getLeaderboard(school_id, period);
    res.json({ entries });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const getBadges = async (req, res) => {
  const { school_id } = req.params;
  if (!validId(school_id)) return res.status(400).json({ error: 'Invalid school_id' });
  try {
    const badges = await gam.getBadges(school_id);
    res.json({ badges });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const createBadge = async (req, res) => {
  const { school_id, name, description, icon, condition_type, condition_value } = req.body;
  if (!school_id || !name) return res.status(400).json({ error: 'school_id and name required' });
  try {
    const badge = await gam.createBadge({ school_id, name, description, icon, condition_type, condition_value });
    res.json({ badge });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const award = async (req, res) => {
  const { student_id, school_id, points } = req.body;
  if (!student_id || !school_id || !points) return res.status(400).json({ error: 'student_id, school_id, points required' });
  try {
    const profile = await gam.awardPoints(student_id, school_id, points);
    res.json({ profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

module.exports = { getProfile, getLeaderboard, getBadges, createBadge, award };
