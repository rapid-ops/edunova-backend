const m = require('../models/aitutor.model');
const chat = async (req, res) => {
  try {
    const { student_id, course_id, message } = req.body;
    if (!student_id || !course_id || !message) return res.status(400).json({ error: 'student_id, course_id, message required' });
    const session = await m.getOrCreate({ student_id, course_id });
    const courseSummary = await m.getCourseSummary(course_id);
    const messages = session.messages || [];
    messages.push({ role: 'user', content: message });
    const systemPrompt = `You are an AI tutor for this specific course. Only answer questions related to the course content below. If asked about unrelated topics, politely redirect to the course material.\n\nCOURSE CONTENT:\n${courseSummary || 'Course content not yet available.'}`;
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system: systemPrompt, messages: messages.slice(-10).map(msg => ({ role: msg.role, content: msg.content })) }) });
    const aiData = await aiRes.json();
    const reply = aiData.content?.[0]?.text || 'Sorry, I could not generate a response.';
    messages.push({ role: 'assistant', content: reply });
    await m.appendMessage(session.id, { role: 'user', content: message });
    await m.appendMessage(session.id, { role: 'assistant', content: reply });
    res.json({ reply, session_id: session.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const getSession = async (req, res) => { try { const s = await require('../models/aitutor.model').getOrCreate({ student_id: req.params.student_id, course_id: req.params.course_id }); res.json({ session: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { chat, getSession };
