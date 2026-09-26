const { upsertProgress, getCourseProgress, getCourseCompletionPercent } = require('../models/progress.model');
const { issueCertificate } = require('../models/certificate.model');

const updateProgress = async (req, res) => {
  try {
    const { student_id, lesson_id, course_id, watch_percent, completed } = req.body;
    if (!student_id || !lesson_id || !course_id) return res.status(400).json({ error: 'student_id, lesson_id, course_id required' });
    const progress = await upsertProgress({ student_id, lesson_id, course_id, watch_percent, completed });
    const percent = await getCourseCompletionPercent(student_id, course_id);
    let certificate = null;
    if (percent === 100) {
      certificate = await issueCertificate({ student_id, course_id, school_id: req.body.school_id });
    }
    res.json({ progress, course_completion_percent: percent, certificate });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getCourseProgressHandler = async (req, res) => {
  try {
    const { student_id, course_id } = req.params;
    const progress = await getCourseProgress(student_id, course_id);
    const percent = await getCourseCompletionPercent(student_id, course_id);
    res.json({ progress, completion_percent: percent });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { updateProgress, getCourseProgressHandler };
