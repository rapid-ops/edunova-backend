const axios = require('axios');

const WAHA_URL = process.env.WAHA_URL || 'http://localhost:3000';
const WAHA_KEY = process.env.WAHA_API_KEY || 'edunova_waha_secret';
const SESSION = 'edunova';

const sendWhatsApp = async (phone, message) => {
  try {
    const formatted = phone.startsWith('+') ? phone.slice(1) : phone;
    const chatId = `${formatted}@c.us`;
    await axios.post(
      `${WAHA_URL}/api/sendText`,
      { chatId, text: message, session: SESSION },
      { headers: { 'X-Api-Key': WAHA_KEY } }
    );
    return true;
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    return false;
  }
};

const sendGeneralNotification = async (phone, title, body) => {
  return sendWhatsApp(phone, `*${title}*\n\n${body}`);
};

const sendFeeReminder = async (phone, studentName, amount, description) => {
  const message = `*Edunova Fee Alert*\n\nDear parent of ${studentName},\n\n₦${Number(amount).toLocaleString()} is due for: ${description}.\n\nLog in to pay.`;
  return sendWhatsApp(phone, message);
};

const sendAttendanceAlert = async (phone, studentName, status, date) => {
  const message = `*Edunova Attendance*\n\n${studentName} was marked *${status}* on ${date}.`;
  return sendWhatsApp(phone, message);
};

const sendResultNotification = async (phone, studentName, subject, grade) => {
  const message = `*Edunova Result*\n\n${studentName} scored *Grade ${grade}* in ${subject}.`;
  return sendWhatsApp(phone, message);
};

module.exports = {
  sendWhatsApp,
  sendGeneralNotification,
  sendFeeReminder,
  sendAttendanceAlert,
  sendResultNotification,
};
