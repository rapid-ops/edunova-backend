const pool = require('../config/db');
const { isEnrolled, getCourseSchool } = require('./assignment.model');

const GRACE_SECONDS = 60;

const norm = (v) => String(v === undefined || v === null ? '' : v).trim().toLowerCase();

const isCorrect = (q, given) => {
  if (norm(given) === '') return false;
  if (q.type === 'short_answer') {
    return String(q.correct_answer || '').split('|').map(norm).filter(Boolean).includes(norm(given));
  }
  return norm(given) === norm(q.correct_answer);
};

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const getAssessment = async (id) => {
  const r = await pool.query(
    `SELECT a.*, c.school_id AS course_school_id, c.title AS course_title
     FROM assessments a JOIN courses c ON c.id=a.course_id
     WHERE a.id=$1 AND a.type='quiz'`,
    [id]
  );
  return r.rows[0] || null;
};

const createQuiz = async (course_id, s) => {
  const r = await pool.query(
    `INSERT INTO assessments (course_id, title, type, instructions, due_date, total_marks,
       time_limit_minutes, max_attempts, pass_percent, randomize_questions, awards_certificate)
     VALUES ($1,$2,'quiz',$3,$4,100,$5,$6,$7,$8,$9) RETURNING *`,
    [course_id, s.title, s.instructions, s.due_date, s.time_limit_minutes, s.max_attempts,
     s.pass_percent, s.randomize_questions, s.awards_certificate]
  );
  return r.rows[0];
};

const updateSettings = async (id, s) => {
  const r = await pool.query(
    `UPDATE assessments SET title=$2, instructions=$3, due_date=$4, time_limit_minutes=$5,
       max_attempts=$6, pass_percent=$7, randomize_questions=$8, awards_certificate=$9
     WHERE id=$1 RETURNING *`,
    [id, s.title, s.instructions, s.due_date, s.time_limit_minutes, s.max_attempts,
     s.pass_percent, s.randomize_questions, s.awards_certificate]
  );
  return r.rows[0];
};

const recalcTotal = async (assessment_id) => {
  await pool.query(
    `UPDATE assessments
     SET total_marks = COALESCE(NULLIF((SELECT SUM(marks) FROM quiz_questions WHERE assessment_id=$1), 0), 100)
     WHERE id=$1`,
    [assessment_id]
  );
};

const getTotalMarks = async (assessment_id) => {
  const r = await pool.query(
    `SELECT COALESCE(SUM(marks),0)::int AS total FROM quiz_questions WHERE assessment_id=$1`,
    [assessment_id]
  );
  return r.rows[0].total;
};

const countQuestions = async (assessment_id) => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM quiz_questions WHERE assessment_id=$1`,
    [assessment_id]
  );
  return r.rows[0].n;
};

const addQuestion = async ({ assessment_id, question, type, options, correct_answer, marks }) => {
  const r = await pool.query(
    `INSERT INTO quiz_questions (assessment_id, question, type, options, correct_answer, marks, position)
     VALUES ($1,$2,$3,$4,$5,$6,(SELECT COUNT(*) FROM quiz_questions WHERE assessment_id=$1))
     RETURNING *`,
    [assessment_id, question, type, options ? JSON.stringify(options) : null, correct_answer, marks]
  );
  return r.rows[0];
};

const getQuestions = async (assessment_id) => {
  const r = await pool.query(
    `SELECT * FROM quiz_questions WHERE assessment_id=$1 ORDER BY position ASC, id ASC`,
    [assessment_id]
  );
  return r.rows;
};

const getQuestionWithSchool = async (id) => {
  const r = await pool.query(
    `SELECT q.*, c.school_id AS course_school_id
     FROM quiz_questions q
     JOIN assessments a ON a.id=q.assessment_id
     JOIN courses c ON c.id=a.course_id
     WHERE q.id=$1`,
    [id]
  );
  return r.rows[0] || null;
};

const deleteQuestion = async (id) => {
  await pool.query(`DELETE FROM quiz_questions WHERE id=$1`, [id]);
};

const listByCourse = async (course_id) => {
  const r = await pool.query(
    `SELECT a.id, a.course_id, a.title, a.due_date, a.total_marks, a.time_limit_minutes,
            a.max_attempts, a.pass_percent, a.awards_certificate,
            (SELECT COUNT(*) FROM quiz_questions q WHERE q.assessment_id=a.id)::int AS question_count,
            (SELECT COUNT(*) FROM quiz_attempts t WHERE t.assessment_id=a.id AND t.status='submitted')::int AS students_attempted
     FROM assessments a
     WHERE a.course_id=$1 AND a.type='quiz'
     ORDER BY a.created_at DESC`,
    [course_id]
  );
  return r.rows;
};

const listForStudent = async (student_id) => {
  const r = await pool.query(
    `SELECT a.id, a.course_id, a.title, a.due_date, a.total_marks, a.time_limit_minutes,
            a.max_attempts, a.pass_percent, c.title AS course_title,
            (SELECT COUNT(*) FROM quiz_questions q WHERE q.assessment_id=a.id)::int AS question_count,
            t.status AS attempt_status, t.attempt_count AS attempts_used, t.score AS best_score, t.passed
     FROM assessments a
     JOIN courses c ON c.id=a.course_id
     JOIN enrollments e ON e.course_id=a.course_id AND e.student_id=$1
     LEFT JOIN quiz_attempts t ON t.assessment_id=a.id AND t.student_id=$1
     WHERE a.type='quiz'
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [student_id]
  );
  return r.rows;
};

const getAttemptState = async (assessment_id, student_id) => {
  const r = await pool.query(
    `SELECT status, attempt_count, score, last_score, passed,
            EXTRACT(EPOCH FROM (NOW() - started_at))::float AS elapsed
     FROM quiz_attempts WHERE assessment_id=$1 AND student_id=$2`,
    [assessment_id, student_id]
  );
  return r.rows[0] || null;
};

const startAttempt = async (a, student_id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const qs = await client.query(
      `SELECT id FROM quiz_questions WHERE assessment_id=$1 ORDER BY position ASC, id ASC`,
      [a.id]
    );
    const ids = qs.rows.map((r) => r.id);
    if (!ids.length) {
      await client.query('ROLLBACK');
      return { error: 'This quiz has no questions yet', code: 400 };
    }

    const cur = await client.query(
      `SELECT *, EXTRACT(EPOCH FROM (NOW() - started_at))::float AS elapsed
       FROM quiz_attempts WHERE assessment_id=$1 AND student_id=$2 FOR UPDATE`,
      [a.id, student_id]
    );
    const row = cur.rows[0];
    const limitSec = a.time_limit_minutes ? a.time_limit_minutes * 60 : null;

    if (row && row.status === 'in_progress') {
      const over = limitSec !== null && row.elapsed > limitSec + GRACE_SECONDS;
      if (!over) {
        await client.query('COMMIT');
        return {
          ids: Array.isArray(row.question_order) ? row.question_order : ids,
          seconds_left: limitSec === null ? null : Math.max(0, Math.round(limitSec - row.elapsed)),
          attempt_number: row.attempt_count,
          resumed: true,
        };
      }
      await client.query(
        `UPDATE quiz_attempts SET status='submitted', last_score=0, score=COALESCE(score,0), submitted_at=NOW() WHERE id=$1`,
        [row.id]
      );
      row.status = 'submitted';
    }

    const used = row ? row.attempt_count : 0;
    if (used >= (a.max_attempts || 1)) {
      await client.query('COMMIT');
      return { error: 'No attempts left', code: 400 };
    }

    const closed = await client.query(
      `SELECT (due_date IS NOT NULL AND due_date < NOW()) AS closed FROM assessments WHERE id=$1`,
      [a.id]
    );
    if (closed.rows[0].closed) {
      await client.query('COMMIT');
      return { error: 'This quiz is closed', code: 400 };
    }

    const order = a.randomize_questions ? shuffle(ids.slice()) : ids;
    if (row) {
      await client.query(
        `UPDATE quiz_attempts
         SET status='in_progress', attempt_count=attempt_count+1, started_at=NOW(), answers=NULL, question_order=$2::jsonb
         WHERE id=$1`,
        [row.id, JSON.stringify(order)]
      );
    } else {
      await client.query(
        `INSERT INTO quiz_attempts (assessment_id, student_id, status, attempt_count, started_at, question_order, passed)
         VALUES ($1,$2,'in_progress',1,NOW(),$3::jsonb,false)`,
        [a.id, student_id, JSON.stringify(order)]
      );
    }
    await client.query('COMMIT');
    return { ids: order, seconds_left: limitSec, attempt_number: used + 1, resumed: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const submitQuizAttempt = async (a, student_id, answers) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT *, EXTRACT(EPOCH FROM (NOW() - started_at))::float AS elapsed
       FROM quiz_attempts WHERE assessment_id=$1 AND student_id=$2 FOR UPDATE`,
      [a.id, student_id]
    );
    const row = cur.rows[0];
    if (!row || row.status !== 'in_progress') {
      await client.query('ROLLBACK');
      return { error: 'No active attempt. Start the quiz first.', code: 400 };
    }
    const limitSec = a.time_limit_minutes ? a.time_limit_minutes * 60 : null;
    const late = limitSec !== null && row.elapsed > limitSec + GRACE_SECONDS;

    const qs = await client.query(`SELECT * FROM quiz_questions WHERE assessment_id=$1`, [a.id]);
    let score = 0;
    let total = 0;
    qs.rows.forEach((q) => {
      total += q.marks;
      if (!late && isCorrect(q, answers[q.id])) score += q.marks;
    });
    const percent = total > 0 ? (score / total) * 100 : 0;
    const passMark = a.pass_percent === null || a.pass_percent === undefined ? 50 : a.pass_percent;
    const passed = !late && percent >= passMark;

    const upd = await client.query(
      `UPDATE quiz_attempts
       SET status='submitted', answers=$1::jsonb, last_score=$2,
           score=GREATEST(COALESCE(score,0), $2::numeric),
           passed=(COALESCE(passed,false) OR $3), submitted_at=NOW()
       WHERE id=$4 RETURNING *`,
      [JSON.stringify(late ? {} : answers), score, passed, row.id]
    );
    await client.query('COMMIT');

    if (late) {
      return { error: 'Time is up. This attempt was closed with no score.', code: 400, expired: true };
    }
    const r = upd.rows[0];
    return {
      score,
      total,
      percent: Math.round(percent * 10) / 10,
      passed,
      best_score: Number(r.score),
      attempts_used: r.attempt_count,
      attempts_allowed: a.max_attempts || 1,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const listAttempts = async (assessment_id) => {
  const r = await pool.query(
    `SELECT t.id, t.student_id, t.score, t.last_score, t.attempt_count, t.status, t.passed, t.submitted_at,
            u.full_name, u.email
     FROM quiz_attempts t JOIN users u ON u.id=t.student_id
     WHERE t.assessment_id=$1 ORDER BY t.submitted_at DESC`,
    [assessment_id]
  );
  return r.rows;
};

// Kept so nothing that imported the old model breaks
const submitAttempt = async ({ assessment_id, student_id, answers, score }) => {
  const result = await pool.query(
    `INSERT INTO quiz_attempts (assessment_id, student_id, answers, score)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (assessment_id, student_id) DO UPDATE SET answers=$3, score=$4, submitted_at=NOW()
     RETURNING *`,
    [assessment_id, student_id, JSON.stringify(answers), score]
  );
  return result.rows[0];
};
const getAttempt = async (assessment_id, student_id) => {
  const result = await pool.query(
    `SELECT * FROM quiz_attempts WHERE assessment_id=$1 AND student_id=$2`,
    [assessment_id, student_id]
  );
  return result.rows[0];
};
const getAllAttempts = listAttempts;

module.exports = {
  isEnrolled, getCourseSchool,
  getAssessment, createQuiz, updateSettings, recalcTotal, getTotalMarks, countQuestions,
  addQuestion, getQuestions, getQuestionWithSchool, deleteQuestion,
  listByCourse, listForStudent, getAttemptState, startAttempt, submitQuizAttempt, listAttempts,
  submitAttempt, getAttempt, getAllAttempts,
};
