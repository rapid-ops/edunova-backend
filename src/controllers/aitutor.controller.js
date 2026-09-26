const m = require('../models/aitutor.model');
const { chat } = require('../services/groq.service');

const chatHandler = async (req, res) => {
  try {
    const { student_id, course_id, message } = req.body;
    if (!student_id || !course_id || !message) return res.status(400).json({ error: 'student_id, course_id, message required' });
    const session = await m.getOrCreate({ student_id, course_id });
    const courseSummary = await m.getCourseSummary(course_id);
    const messages = session.messages || [];
    messages.push({ role: 'user', content: message });
    const system = `You are an AI tutor. Only answer questions based on this course content:\n\n${courseSummary || 'Content not yet available.'}`;
    const reply = await chat(messages.slice(-10), system, 1000);
    await m.appendMessage(session.id, { role: 'user', content: message });
    await m.appendMessage(session.id, { role: 'assistant', content: reply });
    res.json({ reply, session_id: session.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getSession = async (req, res) => { try { const s = await m.getOrCreate({ student_id: req.params.student_id, course_id: req.params.course_id }); res.json({ session: s }); } catch (err) { res.status(500).json({ error: err.message }); } };

module.exports = { chat: chatHandler, getSession };
