const m = require('../models/analytics.model');
const track = async (req, res) => { try { await m.track(req.body); res.json({ message: 'Tracked' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const cohort = async (req, res) => { try { const data = await m.getCohortRetention(req.params.school_id); res.json({ data }); } catch (err) { res.status(500).json({ error: err.message }); } };
const dropout = async (req, res) => { try { const data = await m.getDropoutRisk(req.params.school_id); res.json({ data }); } catch (err) { res.status(500).json({ error: err.message }); } };
const completion = async (req, res) => { try { const data = await m.getCompletionRates(req.params.school_id); res.json({ data }); } catch (err) { res.status(500).json({ error: err.message }); } };
const instructor = async (req, res) => { try { const data = await m.getInstructorPerformance(req.params.school_id); res.json({ data }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { track, cohort, dropout, completion, instructor };
