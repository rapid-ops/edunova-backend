const m = require('../models/skillgap.model');
const competencyModel = require('../models/competency.model');
const { chat } = require('../services/groq.service');

const analyze = async (req, res) => {
  try {
    const { student_id, school_id, cv_text } = req.body;
    if (!student_id || !cv_text) return res.status(400).json({ error: 'student_id and cv_text required' });
    const competencies = await competencyModel.getStudentCompetencies(student_id);
    const allCompetencies = await competencyModel.getBySchool(school_id);
    const achieved = competencies.map(c => c.name);
    const missing = allCompetencies.filter(c => !achieved.includes(c.name)).map(c => c.name);
    const text = await chat([{ role: 'user', content: `Analyze this CV and identify skill gaps. CV: "${cv_text.slice(0, 1000)}". Has: ${achieved.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}. Return ONLY valid JSON: {"gaps":["gap1"],"recommendations":["rec1"],"top_skills_to_learn":["skill1"]}` }], null, 800);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { gaps: missing, recommendations: [], top_skills_to_learn: [] };
    const saved = await m.save({ student_id, school_id, cv_text, gaps: parsed.gaps, recommendations: parsed.recommendations });
    res.json({ analysis: { ...saved, ...parsed } });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const list = async (req, res) => { try { const analyses = await m.getByStudent(req.params.student_id); res.json({ analyses }); } catch (err) { res.status(500).json({ error: err.message }); } };

module.exports = { analyze, list };
