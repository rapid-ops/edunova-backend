const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const routes = [
  'accreditation','adaptive','aicourse','aitutor','analytics','announcement',
  'apikey','assessment','assignment','attendance','auditlog','auth','automation',
  'b2bticket','batch','blockchain','career','certificate','class','classsession',
  'competency','contact','coupon','course','courseassignment','courseevolution',
  'curriculum','customrole','department','discussion','dropout','enrollment',
  'fee','gradebook','import','learningpath','learningtwin','lesson','message',
  'mfa','notification','oauth','parent','payment','peerreview','proctoring',
  'program','progress','proofofwork','quiz','reportcard','result','review',
  'school','schoolapply','schoolimage','schooltheme','scorm','semester',
  'skillgap','skillpassport','studentclass','subscription','suggestion','ticket',
  'timetable','transcript','upload','virtuallab'
];

routes.forEach(name => {
  try {
    const router = require(`./routes/${name}.routes`);
    app.use(`/api/${name}s`, router);
  } catch (e) {
    console.warn(`Route load failed: ${name} —`, e.message);
  }
});

// Manual route overrides (correct paths)
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/auth', require('./routes/oauth.routes'));
app.use('/api/mfa', require('./routes/mfa.routes'));
app.use('/api/api-keys', require('./routes/apikey.routes'));
app.use('/api/schools', require('./routes/school.routes'));
app.use('/api/schools', require('./routes/schooltheme.routes'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.use("/api/ai", require("./routes/ai.routes"));
app.use('/api/personalization', require('./routes/personalization.routes'));
app.use('/api/peer-reviews', require('./routes/peerreview.routes'));
app.use('/api/proof-of-work', require('./routes/proofofwork.routes'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
