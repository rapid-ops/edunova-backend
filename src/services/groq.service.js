const Groq = require('groq-sdk');
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const chat = async (messages, system, max_tokens = 1000) => {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  msgs.push(...messages);
  const res = await client.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    max_tokens,
    messages: msgs,
  });
  return res.choices[0]?.message?.content || '';
};

module.exports = { chat };
