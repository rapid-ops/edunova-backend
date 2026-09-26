const m = require('../models/career.model');
const competencyModel = require('../models/competency.model');
const { chat } = require('../services/groq.service');

const match = async (req, res) => {
  try {
    const { student_id, school_id } = req.body;
    const competencies = await competencyModel.getStudentCompetencies(student_id);
    const skills = competencies.map(c => c.name).join(', ') || 'general skills';
    const text = await chat([{ role: 'user', content: `Based on competencies: "${skills}", suggest 5 career matches. Return ONLY valid JSON: {"matches":[{"job_title":"Software Engineer","company":"Any Tech Company","match_score":85,"matched_competencies":["skill1"],"job_url":"https://linkedin.com/jobs"}]}` }], null, 800);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { matches: [] };
    await m.save({ student_id, school_id, matches: parsed.matches });
    res.json({ matches: parsed.matches });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const list = async (req, res) => { try { const matches = await m.getByStudent(req.params.student_id); res.json({ matches }); } catch (err) { res.status(500).json({ error: err.message }); } };

module.exports = { match, list };
