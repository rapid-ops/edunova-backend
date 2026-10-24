const { validId, sameSchool, canSeeStudent, schoolForCreate } = require('../utils/access');
const gam = require('../models/gamification.model');

const CONDITIONS = ['xp_earned', 'streak_days', 'lessons_complete', 'level_reached'];
const PERIODS = ['weekly', 'monthly', 'all_time'];
const fail = (res, err) => res.status(500).json({ error: err.message });

const getProfile = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ profile: await gam.getProfile(access.student.id) });
  } catch (e) { fail(res, e); }
};

const getLeaderboard = async (req, res) => {
  try {
    const { school_id } = req.params;
    if (!validId(school_id)) return res.status(400).json({ error: 'Invalid school_id' });
    if (!sameSchool(req.user, school_id)) return res.status(403).json({ error: 'Access denied' });
    const period = PERIODS.includes(req.query.period) ? req.query.period : 'all_time';
    res.json({ entries: await gam.getLeaderboard(school_id, period) });
  } catch (e) { fail(res, e); }
};

const getBadges = async (req, res) => {
  try {
    const { school_id } = req.params;
    if (!validId(school_id)) return res.status(400).json({ error: 'Invalid school_id' });
    if (!sameSchool(req.user, school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ badges: await gam.getBadges(school_id) });
  } catch (e) { fail(res, e); }
};

const createBadge = async (req, res) => {
  try {
    const school_id = schoolForCreate(req, res);
    if (school_id == null) return;
    const name = String(req.body.name || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'name required' });
    const { condition_type, condition_value } = req.body;
    if (!CONDITIONS.includes(condition_type)) {
      return res.status(400).json({ error: 'condition_type must be one of ' + CONDITIONS.join(', ') });
    }
    const cv = Number(condition_value);
    if (!Number.isInteger(cv) || cv < 1 || cv > 100000) {
      return res.status(400).json({ error: 'condition_value must be a positive whole number' });
    }
    const description = req.body.description ? String(req.body.description).slice(0, 500) : null;
    const icon = req.body.icon ? String(req.body.icon).slice(0, 50) : null;
    const badge = await gam.createBadge({ school_id, name, description, icon, condition_type, condition_value: cv });
    res.status(201).json({ badge });
  } catch (e) { fail(res, e); }
};

const award = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.body.student_id, ['school_admin']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    if (access.student.school_id == null) return res.status(400).json({ error: 'Student has no school' });
    const pts = Number(req.body.points);
    if (!Number.isInteger(pts) || pts < 1 || pts > 1000) {
      return res.status(400).json({ error: 'points must be a whole number from 1 to 1000' });
    }
    const profile = await gam.awardPoints(access.student.id, access.student.school_id, pts, 'manual');
    res.json({ profile });
  } catch (e) { fail(res, e); }
};

module.exports = { getProfile, getLeaderboard, getBadges, createBadge, award };
