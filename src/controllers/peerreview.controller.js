const m = require('../models/peerreview.model');
const submit = async (req, res) => { try { const r = await m.submitReview(req.body); res.status(201).json({ review: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
const credits = async (req, res) => { try { const c = await m.getCredits(req.params.student_id); res.json({ credits: c || { credits: 0 } }); } catch (err) { res.status(500).json({ error: err.message }); } };
const spend = async (req, res) => { try { const c = await m.spendCredits(req.params.student_id, req.body.amount); res.json({ credits: c }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const r = await m.getReviews(req.params.submission_id); res.json({ reviews: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { submit, credits, spend, list };
