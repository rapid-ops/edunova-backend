const m = require('../models/assignment.model');

const create = async (req, res) => {
  try {
    const { course_id, title } = req.body;
    if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required' });
    const assignment = await m.createAssignment(req.body);
    res.status(201).json({ assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listByCourse = async (req, res) => {
  try {
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
    const ok = await m.isParentOf(req.user.id, req.params.student_id);
    if (!ok) return res.status(403).json({ error: 'Not your child' });
    res.json({ assignments: await m.getForStudent(req.params.student_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const detail = async (req, res) => {
  try {
    const assignment = await m.getAssignment(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    const submission = req.user.role === 'student'
      ? await m.getMySubmission(assignment.id, req.user.id)
      : null;
    res.json({ assignment, submission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const submit = async (req, res) => {
  try {
    const assignment = await m.getAssignment(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const late = assignment.due_date && new Date(assignment.due_date) < new Date();
    if (late && assignment.allow_late === false) {
      return res.status(400).json({ error: 'Deadline has passed' });
    }

    const text_answer = (req.body.text_answer || '').trim();
    const file_url = req.file ? req.file.path : null;
    if (!text_answer && !file_url) {
      return res.status(400).json({ error: 'Provide a text answer or a file' });
    }

    const submission = await m.submit({
      assessment_id: assignment.id,
      student_id: req.user.id,
      file_url,
      text_answer
    });
    if (!submission) return res.status(400).json({ error: 'Already graded, cannot resubmit' });
    res.json({ submission, late: !!late });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const submissions = async (req, res) => {
  try {
    res.json({ submissions: await m.listSubmissions(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const gradeSubmission = async (req, res) => {
  try {
    const sub = await m.getSubmissionWithAssignment(req.params.submission_id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    const score = Number(req.body.score);
    if (Number.isNaN(score) || score < 0 || score > sub.total_marks) {
      return res.status(400).json({ error: `Score must be between 0 and ${sub.total_marks}` });
    }
    const graded = await m.grade(sub.id, {
      score, feedback: req.body.feedback, graded_by: req.user.id
    });
    res.json({ submission: graded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, listByCourse, myAssignments, childAssignments, detail, submit, submissions, gradeSubmission };
