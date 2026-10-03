const sendWhatsApp = async (phone, message) => {
  if (!phone) return;
  try {
    const raw = String(phone).replace(/\D/g, '');
    const formatted = raw.startsWith('0') ? '234' + raw.slice(1) : raw;
    const res = await fetch(`${process.env.WAHA_URL}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.WAHA_API_KEY,
      },
      body: JSON.stringify({
        chatId: `${formatted}@c.us`,
        text: message,
        session: 'default',
      }),
    });
    if (!res.ok) console.error('WhatsApp send failed:', await res.text());
  } catch (err) {
    console.error('WhatsApp error:', err.message);
  }
};

module.exports = { sendWhatsApp };
