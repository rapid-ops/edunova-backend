const m = require('../models/skillgap.model');
const competencyModel = require('../models/competency.model');
const analyze = async (req, res) => {
  try {
    const { student_id, school_id, cv_text } = req.body;
    if (!student_id || !cv_text) return res.status(400).json({ error: 'student_id and cv_text required' });
    const competencies = await competencyModel.getStudentCompetencies(student_id);
    const allCompetencies = await competencyModel.getBySchool(school_id);
    const achieved = competencies.map(c => c.name);
    const missing = allCompetencies.filter(c => !achieved.includes(c.name)).map(c => c.name);
    const aiPrompt = `Analyze this CV and identify skill gaps. CV: "${cv_text.slice(0, 1000)}". Student has these competencies: ${achieved.join(', ') || 'none'}. Missing competencies: ${missing.join(', ') || 'none'}. Return ONLY valid JSON: {"gaps":["gap1","gap2"],"recommendations":["rec1","rec2"],"top_skills_to_learn":["skill1","skill2"]}`;
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, messages: [{ role: 'user', content: aiPrompt }] }) });
    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { gaps: missing, recommendations: [], top_skills_to_learn: [] };
    const saved = await m.save({ student_id, school_id, cv_text, gaps: parsed.gaps, recommendations: parsed.recommendations });
    res.json({ analysis: { ...saved, ...parsed } });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const list = async (req, res) => { try { const analyses = await m.getByStudent(req.params.student_id); res.json({ analyses }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { analyze, list };
