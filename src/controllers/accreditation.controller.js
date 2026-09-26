const m = require('../models/accreditation.model');
const issue = async (req, res) => { try { const c = await m.issue(req.body); res.status(201).json({ credit: c }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byStudent = async (req, res) => { try { const credits = await m.getByStudent(req.params.student_id); res.json({ credits }); } catch (err) { res.status(500).json({ error: err.message }); } };
const expiring = async (req, res) => { try { const credits = await m.getExpiring(req.params.school_id, req.query.days || 30); res.json({ credits }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { issue, byStudent, expiring };
