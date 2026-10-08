const pool = require('../config/db');
const { chat } = require('../services/groq.service');
const axios = require('axios');

const generateQuiz = async (req, res) => {
  try {
    const { course_id, topic, num_questions = 5, difficulty = 'medium', assessment_id } = req.body;
    if (!course_id || !topic) return res.status(400).json({ error: 'course_id and topic required' });
    const prompt = `Generate ${num_questions} ${difficulty} quiz questions about "${topic}". Return ONLY valid JSON: {"questions":[{"question":"","type":"mcq","options":["","","",""],"correct_answer":"","marks":1}]}`;
    const raw = await chat([{ role: 'user', content: prompt }], null, 2000);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'AI returned invalid JSON' });
    const parsed = JSON.parse(match[0]);
    const saved = await pool.query(
      `INSERT INTO ai_quiz_generations (course_id,topic,difficulty,num_questions,questions,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [course_id, topic, difficulty, num_questions, JSON.stringify(parsed.questions), req.user.id]
    );
    if (assessment_id && parsed.questions?.length) {
      for (const q of parsed.questions) {
        await pool.query(
          `INSERT INTO quiz_questions (assessment_id,question,type,options,correct_answer,marks) VALUES ($1,$2,$3,$4,$5,$6)`,
          [assessment_id, q.question, 'mcq', JSON.stringify(q.options), q.correct_answer, q.marks || 1]
        );
      }
    }
    res.json({ generation: saved.rows[0], questions: parsed.questions });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const generateCourse = async (req, res) => {
  try {
    const { school_id, created_by, prompt, source_type = 'prompt', source_url, auto_create = false } = req.body;
    let contentPrompt = prompt;
    if (source_type === 'youtube_url' && source_url) {
      const vidId = source_url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
      if (!vidId) return res.status(400).json({ error: 'Invalid YouTube URL' });
      try {
        const t = await axios.get(`https://youtube-transcript-api.vercel.app/api?videoId=${vidId}`, { timeout: 10000 });
        const text = (t.data?.transcript || []).map(s => s.text).join(' ').slice(0, 3000);
        contentPrompt = text || `YouTube video: ${source_url}`;
      } catch { contentPrompt = `YouTube video: ${source_url}`; }
    } else if (source_type === 'pdf_text' && source_url) {
      contentPrompt = source_url.slice(0, 3000);
    }
    const sid = school_id || req.user.school_id;
    const cby = created_by || req.user.id;
    const gen = await pool.query(
      `INSERT INTO ai_course_generations (school_id,created_by,prompt,source_type,source_url,status) VALUES ($1,$2,$3,$4,$5,'processing') RETURNING *`,
      [sid, cby, prompt, source_type, source_url]
    );
    const genRow = gen.rows[0];
    res.status(201).json({ generation: genRow, message: 'Generation started' });
    try {
      const raw = await chat([{ role: 'user', content: `Generate a course outline in JSON for: "${contentPrompt}". Return ONLY valid JSON: {"title":"","description":"","modules":[{"title":"","lessons":[{"title":"","content":"","duration_minutes":15}]}]}. 3-5 modules, 3-5 lessons each.` }], null, 2000);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) { await pool.query(`UPDATE ai_course_generations SET status='failed' WHERE id=$1`, [genRow.id]); return; }
      const outline = JSON.parse(match[0]);
      await pool.query(`UPDATE ai_course_generations SET outline=$1,status='done' WHERE id=$2`, [JSON.stringify(outline), genRow.id]);
      if (auto_create && outline.modules) {
        const course = await pool.query(
          `INSERT INTO courses (school_id,title,description,created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
          [sid, outline.title, outline.description, cby]
        );
        const cid = course.rows[0].id;
        for (const mod of outline.modules) {
          const module = await pool.query(`INSERT INTO modules (course_id,title) VALUES ($1,$2) RETURNING id`, [cid, mod.title]);
          const mid = module.rows[0].id;
          for (const lesson of mod.lessons || []) {
            await pool.query(`INSERT INTO lessons (module_id,title,content,duration_minutes) VALUES ($1,$2,$3,$4)`, [mid, lesson.title, lesson.content, lesson.duration_minutes || 15]);
          }
        }
      }
    } catch { await pool.query(`UPDATE ai_course_generations SET status='failed' WHERE id=$1`, [genRow.id]); }
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const teacherCopilot = async (req, res) => {
  try {
    const { question, course_id } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });
    const courses = await pool.query(`SELECT id,title FROM courses WHERE created_by=$1 LIMIT 10`, [req.user.id]);
    let grades = { rows: [] };
    if (course_id) {
      grades = await pool.query(
        `SELECT u.full_name,g.score FROM grades g JOIN users u ON u.id=g.student_id WHERE g.course_id=$1 ORDER BY g.score LIMIT 20`,
        [course_id]
      );
    }
    const context = `Teacher courses: ${courses.rows.map(c => c.title).join(', ') || 'none'}.\nGrades (lowest first): ${grades.rows.map(r => `${r.full_name}: ${r.score}`).join(', ') || 'no data'}.`;
    const reply = await chat(
      [{ role: 'user', content: question }],
      `You are an AI teaching assistant. Context:\n${context}\nAnswer directly and concisely.`,
      1000
    );
    res.json({ reply });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const schoolAdminQuery = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });
    const school_id = req.user.school_id;
    const q = question.toLowerCase();
    let dbResult = '';
    if (q.includes('not logged') || q.includes('inactive')) {
      const days = parseInt(q.match(/(\d+)\s*day/)?.[1] || '7');
      const r = await pool.query(
        `SELECT full_name,last_login_at FROM users WHERE school_id=$1 AND role='student' AND (last_login_at IS NULL OR last_login_at < NOW()-INTERVAL '${days} days') LIMIT 30`,
        [school_id]
      );
      dbResult = `Students inactive ${days}+ days: ${JSON.stringify(r.rows)}`;
    } else if (q.includes('result') || q.includes('submitted')) {
      const r = await pool.query(
        `SELECT u.full_name FROM users u WHERE u.school_id=$1 AND u.role='teacher' AND u.id NOT IN (SELECT DISTINCT created_by FROM assessments WHERE school_id=$1 AND created_at > NOW()-INTERVAL '30 days') LIMIT 20`,
        [school_id]
      );
      dbResult = `Teachers without recent submissions: ${JSON.stringify(r.rows)}`;
    } else if (q.includes('performance') || q.includes('summary')) {
      const r = await pool.query(
        `SELECT c.title,ROUND(AVG(g.score),1) as avg FROM grades g JOIN courses c ON c.id=g.course_id WHERE c.school_id=$1 GROUP BY c.title ORDER BY avg LIMIT 10`,
        [school_id]
      );
      dbResult = `Class performance: ${JSON.stringify(r.rows)}`;
    } else {
      const r = await pool.query(`SELECT COUNT(*) as students FROM users WHERE school_id=$1 AND role='student'`, [school_id]);
      dbResult = `School stats: ${JSON.stringify(r.rows[0])}`;
    }
    const reply = await chat(
      [{ role: 'user', content: `Question: ${question}\nData: ${dbResult}\nAnswer naturally and concisely.` }],
      'You are a school analytics AI. Use the data to answer admin questions.',
      800
    );
    res.json({ reply, data: dbResult });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const predictDropout = async (req, res) => {
  try {
    const school_id = req.body.school_id || req.user.school_id;
    const students = await pool.query(
      `SELECT u.id,u.full_name,u.last_login_at,
        (SELECT COUNT(*) FROM quiz_submissions qs WHERE qs.student_id=u.id) as quiz_count,
        (SELECT ROUND(AVG(score),1) FROM quiz_submissions qs WHERE qs.student_id=u.id) as avg_score,
        (SELECT COUNT(*) FROM assignment_submissions a WHERE a.student_id=u.id) as assignment_count
       FROM users u WHERE u.school_id=$1 AND u.role='student' LIMIT 50`,
      [school_id]
    );
    if (!students.rows.length) return res.json({ predictions: [] });
    const prompt = `Analyze these students and return dropout risk. Return ONLY a valid JSON array: [{"student_id":1,"risk_level":"high","risk_score":0.9,"reason":"..."}]\n\nStudents: ${JSON.stringify(students.rows.slice(0, 20))}`;
    const raw = await chat([{ role: 'user', content: prompt }], null, 2000);
    const match = raw.match(/\[[\s\S]*\]/);
    const predictions = match ? JSON.parse(match[0]) : [];
    for (const p of predictions) {
      await pool.query(
        `INSERT INTO dropout_predictions (student_id,school_id,risk_level,risk_score,factors,predicted_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [p.student_id, school_id, p.risk_level, p.risk_score, JSON.stringify({ reason: p.reason })]
      );
    }
    res.json({ predictions });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getSkillPassport = async (req, res) => {
  try {
    const { student_id } = req.params;
    const [courses, comps, certs, quizAvg] = await Promise.all([
      pool.query(`SELECT c.title,e.completed_at FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.student_id=$1 AND e.completed_at IS NOT NULL`, [student_id]),
      pool.query(`SELECT co.name FROM student_competencies sc JOIN competencies co ON co.id=sc.competency_id WHERE sc.student_id=$1`, [student_id]),
      pool.query(`SELECT title,issued_at FROM blockchain_certificates WHERE student_id=$1`, [student_id]),
      pool.query(`SELECT ROUND(AVG(score),1) as avg FROM quiz_submissions WHERE student_id=$1`, [student_id]),
    ]);
    const passport = {
      student_id: Number(student_id),
      courses_completed: courses.rows,
      competencies: comps.rows.map(r => r.name),
      certificates: certs.rows,
      avg_quiz_score: quizAvg.rows[0]?.avg || 0,
      generated_at: new Date().toISOString(),
    };
    const passportId = `sp-${student_id}-${Date.now()}`;
    await pool.query(
      `INSERT INTO skill_passport (student_id,passport_id,skills,verified_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (student_id) DO UPDATE SET skills=$3,verified_at=NOW()`,
      [student_id, passportId, JSON.stringify(passport)]
    );
    res.json({ passport });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const careerMatch = async (req, res) => {
  try {
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id required' });
    const passportRow = await pool.query(`SELECT skills FROM skill_passport WHERE student_id=$1`, [student_id]);
    const passportData = passportRow.rows[0]?.skills || {};
    const prompt = `Based on this skill passport, suggest top 3 career paths. Return ONLY valid JSON: {"careers":[{"title":"","match_score":0.9,"required_skills":[],"skill_gaps":[]}]}\n\nPassport: ${JSON.stringify(passportData)}`;
    const raw = await chat([{ role: 'user', content: prompt }], null, 1000);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { careers: [] };
    for (const c of parsed.careers) {
      await pool.query(
        `INSERT INTO career_matches (student_id,job_title,match_score,matched_competencies,created_at)
         VALUES ($1,$2,$3,$4,NOW())`,
        [student_id, c.title, c.match_score, JSON.stringify({ required_skills: c.required_skills, skill_gaps: c.skill_gaps })]
      );
    }
    res.json({ careers: parsed.careers });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateLearningTwin = async (req, res) => {
  try {
    const { student_id, event_type, data } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id required' });
    const existing = await pool.query(`SELECT * FROM learning_twins WHERE student_id=$1`, [student_id]);
    const current = existing.rows[0] || {};
    const prompt = `Update this student learning twin. Event: ${event_type}, Data: ${JSON.stringify(data)}, Current: ${JSON.stringify({ speed: current.learning_speed, study_time: current.best_study_time, mistakes: current.common_mistakes })}. Return ONLY valid JSON: {"learning_speed":"fast|medium|slow","best_study_time":"morning|afternoon|evening","common_mistakes":[""],"strengths":[],"weaknesses":[]}`;
    const raw = await chat([{ role: 'user', content: prompt }], null, 600);
    const match = raw.match(/\{[\s\S]*\}/);
    const updated = match ? JSON.parse(match[0]) : {};
    await pool.query(
      `INSERT INTO learning_twins (student_id,learning_speed,best_study_time,common_mistakes,last_analyzed)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (student_id) DO UPDATE SET learning_speed=$2,best_study_time=$3,common_mistakes=$4,last_analyzed=NOW()`,
      [student_id, updated.learning_speed || 'medium', updated.best_study_time || 'morning', JSON.stringify(updated.common_mistakes || [])]
    );
    res.json({ twin: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getLearningTwin = async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM learning_twins WHERE student_id=$1`, [req.params.student_id]);
    res.json({ twin: r.rows[0] || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const translate = async (req, res) => {
  try {
    const { text, target_language } = req.body;
    const allowed = ['English', 'Yoruba', 'Hausa', 'Igbo', 'French'];
    if (!text || !target_language) return res.status(400).json({ error: 'text and target_language required' });
    if (!allowed.includes(target_language)) return res.status(400).json({ error: `target_language must be one of: ${allowed.join(', ')}` });
    const reply = await chat(
      [{ role: 'user', content: `Translate to ${target_language}. Return ONLY the translated text.\n\n${text}` }],
      null, 800
    );
    res.json({ translated: reply, target_language });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { generateQuiz, generateCourse, teacherCopilot, schoolAdminQuery, predictDropout, getSkillPassport, careerMatch, updateLearningTwin, getLearningTwin, translate };
