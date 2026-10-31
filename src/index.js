const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http');
const { Server } = require('socket.io');

const { globalLimiter } = require('./middleware/ratelimit.middleware');
const ORIGINS = [process.env.FRONTEND_URL, 'https://edunova-frontend-gkaj.vercel.app', 'https://edunova-backend-2x7h.onrender.com', 'http://localhost:3000', 'http://localhost:5000'].filter(Boolean);
app.set('trust proxy', 3);
app.use(cors({ origin: (o, cb) => cb(null, !o || ORIGINS.includes(o)), credentials: true }));
app.use(express.json());
app.use(globalLimiter);
app.use(require('./middleware/audit.middleware'));

const routes = [
  'accreditation','adaptive','aicourse','aitutor','analytics','announcement',
  'apikey','assessment','assignment','attendance','auditlog','auth','automation',
  'b2bticket','batch','blockchain','calendar','career','certificate','class','classsession',
  'competency','contact','coupon','course','courseassignment','courseevolution',
  'curriculum','customrole','department','discussion','dropout','enrollment',
  'fee','gradebook','import','learningpath','learningtwin','lesson','message',
  'mfa','notification','oauth','parent','payment','peerreview','proctoring',
  'program','progress','proofofwork','quiz','reportcard','result','review',
  'school','schoolapply','schoolimage','schoolsite','schooltheme','scorm','semester',
  'skillgap','skillpassport','studentclass','submission','subscription','suggestion','ticket',
  'timetable','transcript','upload','virtuallab'
];

// Correct plural paths. The old paths stay live so nothing that calls them breaks.
const ALIASES = {
  class: ['classes'],
  classsession: ['class-sessions'],
  studentclass: ['student-classes'],
  progress: ['progress'],
  batch: ['batches'],
  competency: ['competencies'],
  curriculum: ['curricula'],
};
routes.forEach(name => {
  try {
    const router = require(`./routes/${name}.routes`);
    app.use(`/api/${name}s`, router);
    (ALIASES[name] || []).forEach((a) => app.use(`/api/${a}`, router));
  } catch (e) {
    console.warn(`Route load failed: ${name} —`, e.message);
  }
});

// Manual route overrides (correct paths)
app.use('/api/auth', require('./routes/recovery.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/auth', require('./routes/oauth.routes'));
app.use('/api/auth', require('./routes/signup.routes'));
app.use('/api/register', require('./routes/schoolregistration.routes'));
app.use('/api/approvals', require('./routes/approval.routes'));
app.use('/api/mfa', require('./routes/mfa.routes'));
app.use('/api/api-keys', require('./routes/apikey.routes'));
app.use('/api/schools', require('./routes/school.routes'));
app.use('/api/schools', require('./routes/schooltheme.routes'));

app.use('/api/quizzes', require('./routes/quiz.routes'));
app.use('/api/custom-roles', require('./routes/customrole.routes'));
app.use('/api/audit-logs', require('./routes/auditlog.routes'));
app.use('/api/stats', require('./routes/stats.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/finance', require('./routes/finance.routes'));
app.use('/api/avatar', require('./routes/avatar.routes'));
try { app.use('/api/profile-photo', require('./routes/imageupload.routes')); } catch (e) { console.warn('Route load failed: profile-photo -', e.message); }
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.use("/api/ai", require("./routes/ai.routes"));
app.use('/api/personalization', require('./routes/personalization.routes'));
app.use('/api/skill-gap', require('./routes/skillgap.routes'));
app.use('/api/learning-twin', require('./routes/learningtwin.routes'));
app.use('/api/adaptive-learning', require('./routes/adaptive.routes'));
app.use('/api/dropout', require('./routes/dropout.routes'));
app.use('/api/competencies', require('./routes/competency.routes'));
app.use('/api/peer-reviews', require('./routes/peerreview.routes'));
app.use('/api/school-admin', require('./routes/promote.routes'));
app.use('/api/proof-of-work', require('./routes/proofofwork.routes'));
app.use('/api/gamification', require('./routes/gamification.routes'));
app.use('/api/portal', require('./routes/portaldashboard.routes'));
app.use('/api/people', require('./routes/people.routes'));
app.use('/api/classes', require('./routes/class.routes'));
app.use('/api/student-classes', require('./routes/studentclass.routes'));
app.use('/api/course-assignments', require('./routes/courseassignment.routes'));
// The web app calls /api/upload/...; the loader above only mounts these files at /api/uploads.
app.use('/api/upload', require('./routes/upload.routes'));
app.use('/api/files', require('./routes/filedelivery.routes'));
app.use('/api/class-hub', require('./routes/classhub.routes'));
app.use('/api/upload', require('./routes/schoolimage.routes'));
app.use('/api/owner', require('./routes/owner.routes'));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGINS, credentials: true } });
app.set('io', io);
require('./socket')(io);
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
