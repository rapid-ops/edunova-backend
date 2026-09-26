const m = require('../models/proctoring.model');
const start = async (req, res) => { try { const s = await m.startSession(req.body); res.status(201).json({ session: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const flagEvent = async (req, res) => { try { await m.flagEvent(req.params.session_id, req.body); res.json({ message: 'Flagged' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const end = async (req, res) => { try { const s = await m.endSession(req.params.session_id, req.body.recording_url); res.json({ session: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byAssessment = async (req, res) => { try { const sessions = await m.getByAssessment(req.params.assessment_id); res.json({ sessions }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byStudent = async (req, res) => { try { const sessions = await m.getByStudent(req.params.student_id); res.json({ sessions }); } catch (err) { res.status(500).json({ error: err.message }); } };
const flagSession = async (req, res) => { try { await m.flag(req.params.session_id); res.json({ message: 'Session flagged' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { start, flagEvent, end, byAssessment, byStudent, flagSession };
