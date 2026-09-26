const m = require('../models/aicourse.model');
const { chat } = require('../services/groq.service');

const generate = async (req, res) => {
  try {
    const { school_id, created_by, prompt, source_type, source_url } = req.body;
    if (!prompt && !source_url) return res.status(400).json({ error: 'prompt or source_url required' });
    const gen = await m.create({ school_id, created_by, prompt, source_type, source_url });
    res.status(201).json({ generation: gen, message: 'Generation started' });
    try {
      const text = await chat([{ role: 'user', content: `Generate a complete course outline in JSON for: "${prompt || source_url}". Return ONLY valid JSON: {"title":"Course Title","description":"desc","modules":[{"title":"Module 1","lessons":[{"title":"Lesson 1","content":"overview","duration_minutes":15}]}]}. 3-5 modules, 3-5 lessons each.` }], null, 2000);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) { await m.updateOutline(gen.id, JSON.parse(jsonMatch[0])); }
      else { await m.fail(gen.id); }
    } catch { await m.fail(gen.id); }
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const list = async (req, res) => { try { const gens = await m.getBySchool(req.params.school_id); res.json({ generations: gens }); } catch (err) { res.status(500).json({ error: err.message }); } };

module.exports = { generate, list };
