const m = require('../models/courseevolution.model');
const scan = async (req, res) => { try { const logs = await m.scan(req.body); res.json({ logs }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const logs = await m.getByCourse(req.params.course_id); res.json({ logs }); } catch (err) { res.status(500).json({ error: err.message }); } };
const apply = async (req, res) => { try { await m.apply(req.params.id); res.json({ message: 'Applied' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const reject = async (req, res) => { try { await m.reject(req.params.id); res.json({ message: 'Rejected' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { scan, list, apply, reject };
