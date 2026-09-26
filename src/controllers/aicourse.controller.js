const m = require('../models/aicourse.model');
const generate = async (req, res) => {
  try {
    const { school_id, created_by, prompt, source_type, source_url } = req.body;
    if (!prompt && !source_url) return res.status(400).json({ error: 'prompt or source_url required' });
    const gen = await m.create({ school_id, created_by, prompt, source_type, source_url });
    res.status(201).json({ generation: gen, message: 'Generation started' });
    try {
      const aiPrompt = `You are an expert curriculum designer. Generate a complete course outline in JSON format based on: "${prompt || source_url}". Return ONLY valid JSON with this structure: {"title":"Course Title","description":"Course description","modules":[{"title":"Module 1","lessons":[{"title":"Lesson 1","content":"Lesson overview","duration_minutes":15}]}]}. Generate 3-5 modules with 3-5 lessons each.`;
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: aiPrompt }] }) });
      const aiData = await aiRes.json();
      const text = aiData.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) { const outline = JSON.parse(jsonMatch[0]); await m.updateOutline(gen.id, outline); }
      else { await m.fail(gen.id); }
    } catch { await m.fail(gen.id); }
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const list = async (req, res) => { try { const gens = await m.getBySchool(req.params.school_id); res.json({ generations: gens }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { generate, list };
