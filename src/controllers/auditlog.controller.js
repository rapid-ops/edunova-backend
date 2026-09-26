const m = require('../models/auditlog.model');
const list = async (req, res) => { try { const logs = await m.getBySchool(req.params.school_id, req.query.limit || 100); res.json({ logs }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { list };
