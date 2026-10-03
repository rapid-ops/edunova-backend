const m = require('../models/auditlog.model');
const { validId, sameSchool } = require('../utils/access');

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const n = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(n) && n > 0 ? Math.min(n, 500) : 100;
    res.json({ logs: await m.getBySchool(req.params.school_id, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { list };
