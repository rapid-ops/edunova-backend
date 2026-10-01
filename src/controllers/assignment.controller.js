const m = require('../models/assignment.model');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));
const strip = (a) => { const { course_school_id, ...rest } = a; return rest; };

const create = async (req, res) => {
  try {
    const { course_id, title, instructions, due_date, total_marks, allow_late } = req.body;
    if (!validId(course_id) || !title || !String(title).trim()) {
      return res.status(400).json({ error: 'course_id and title required' });
    }
    if (due_date && Number.isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: 'Invalid due date' });
    }
    const marks = (total_marks === undefined || total_marks === null || total_marks === '') ? 100 : Number(total_marks);
    if (!Number.isFinite(marks) || marks <= 0 || marks > 1000) {
      return res.status(400).json({ error: 'Total marks must be between 1 and 1000' });
    }
    const course = await m.getCourseSchool(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });

    const assignment = await m.createAssignment({
      course_id: Number(course_id),
      title: String(title).trim().slice(0, 255),
      instructions: instructions ? String(instructions).slice(0, 5000) : null,
      due_date,
      total_marks: marks,
      allow_late,
    });
    res.status(201).json({ assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listByCourse = async (req, res) => {
  try {
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const course = await m.getCourseSchool(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ assignments: await m.getByCourse(req.params.course_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const myAssignments = async (req, res) => {
  try {
    res.json({ assignments: await m.getForStudent(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const childAssignments = async (req, res) => {
  try {
    if (!validId(req.params.student_id)) return res.status(404).json({ error: 'Not found' });
    const ok = await m.isParentOf(req.user.id, req.params.student_id);
    if (!ok) return res.status(403).json({ error: 'Not your child' });
    res.json({ assignments: await m.getForStudent(req.params.student_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Loads an assignment and enforces school scope (and enrollment for students).
const loadAllowed = async (req, res) => {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Assignment not found' }); return null; }
  const a = await m.getAssignment(req.params.id);
  if (!a) { res.status(404).json({ error: 'Assignment not found' }); return null; }
  if (!sameSchool(req.user, a.course_school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  if (req.user.role === 'student' && !(await m.isEnrolled(req.user.id, a.course_id))) {
    res.status(403).json({ error: 'You are not enrolled in this course' });
    return null;
  }
  return a;
};

const detail = async (req, res) => {
  try {
    const a = await loadAllowed(req, res);
    if (!a) return;
    const submission = req.user.role === 'student' ? await m.getMySubmission(a.id, req.user.id) : null;
    res.json({ assignment: strip(a), submission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const submit = async (req, res) => {
  try {
    const a = await loadAllowed(req, res);
    if (!a) return;

    const late = a.due_date && new Date(a.due_date) < new Date();
    if (late && a.allow_late === false) {
      return res.status(400).json({ error: 'Deadline has passed' });
    }

    const text_answer = String(req.body.text_answer || '').trim().slice(0, 20000);
    const file_url = req.file ? req.file.path : null;
    if (!text_answer && !file_url) {
      return res.status(400).json({ error: 'Provide a text answer or a file' });
    }

    const submission = await m.submit({
      assessment_id: a.id,
      student_id: req.user.id,
      file_url,
      text_answer,
    });
    if (!submission) return res.status(400).json({ error: 'Already graded, cannot resubmit' });
    res.json({ submission, late: !!late });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const submissions = async (req, res) => {
  try {
    const a = await loadAllowed(req, res);
    if (!a) return;
    res.json({ submissions: await m.listSubmissions(a.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const gradeSubmission = async (req, res) => {
  try {
    if (!validId(req.params.submission_id)) return res.status(404).json({ error: 'Submission not found' });
    const sub = await m.getSubmissionWithAssignment(req.params.submission_id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (!sameSchool(req.user, sub.course_school_id)) return res.status(403).json({ error: 'Access denied' });

    const score = Number(req.body.score);
    if (req.body.score === '' || req.body.score === null || req.body.score === undefined ||
        Number.isNaN(score) || score < 0 || score > sub.total_marks) {
      return res.status(400).json({ error: `Score must be between 0 and ${sub.total_marks}` });
    }
    const feedback = req.body.feedback ? String(req.body.feedback).slice(0, 2000) : null;
    const graded = await m.grade(sub.id, { score, feedback, graded_by: req.user.id });
    res.json({ submission: graded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, listByCourse, myAssignments, childAssignments, detail, submit, submissions, gradeSubmission };
