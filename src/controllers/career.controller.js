const m = require('../models/career.model');
const competencyModel = require('../models/competency.model');
const match = async (req, res) => {
  try {
    const { student_id, school_id } = req.body;
    const competencies = await competencyModel.getStudentCompetencies(student_id);
    const skills = competencies.map(c => c.name).join(', ') || 'general skills';
    const aiPrompt = `Based on these competencies: "${skills}", suggest 5 career matches. Return ONLY valid JSON: {"matches":[{"job_title":"Software Engineer","company":"Any Tech Company","match_score":85,"matched_competencies":["skill1"],"job_url":"https://linkedin.com/jobs"}]}`;
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, messages: [{ role: 'user', content: aiPrompt }] }) });
    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { matches: [] };
    await m.save({ student_id, school_id, matches: parsed.matches });
    res.json({ matches: parsed.matches });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const list = async (req, res) => { try { const matches = await m.getByStudent(req.params.student_id); res.json({ matches }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { match, list };
