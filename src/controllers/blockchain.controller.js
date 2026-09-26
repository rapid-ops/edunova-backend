const m = require('../models/blockchain.model');
const crypto = require('crypto');
const issue = async (req, res) => {
  try {
    const { certificate_id, student_id, chain } = req.body;
    if (!certificate_id || !student_id) return res.status(400).json({ error: 'certificate_id and student_id required' });
    const tx_hash = '0x' + crypto.randomBytes(32).toString('hex');
    const token_id = crypto.randomBytes(8).toString('hex');
    const metadata_url = `${process.env.BACKEND_URL || 'https://edunova-backend-2x7h.onrender.com'}/api/blockchain/verify/${tx_hash}`;
    const qr_code_url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(metadata_url)}`;
    const bc = await m.issue({ certificate_id, student_id, tx_hash, chain: chain || 'polygon', token_id, metadata_url, qr_code_url });
    res.status(201).json({ blockchain_certificate: bc });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const byStudent = async (req, res) => { try { const certs = await m.getByStudent(req.params.student_id); res.json({ certificates: certs }); } catch (err) { res.status(500).json({ error: err.message }); } };
const verify = async (req, res) => { try { const cert = await m.verify(req.params.tx_hash); if (!cert) return res.status(404).json({ error: 'Certificate not found' }); res.json({ valid: true, certificate: cert }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { issue, byStudent, verify };
