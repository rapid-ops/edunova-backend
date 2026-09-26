const m = require('../models/coupon.model');
const create = async (req, res) => { try { const c = await m.create(req.body); res.status(201).json({ coupon: c }); } catch (err) { res.status(500).json({ error: err.message }); } };
const validate = async (req, res) => { try { const c = await m.validate(req.body.code, req.body.school_id); if (!c) return res.status(404).json({ error: 'Invalid or expired coupon' }); res.json({ coupon: c }); } catch (err) { res.status(500).json({ error: err.message }); } };
const apply = async (req, res) => { try { await m.use(req.params.id); res.json({ message: 'Coupon applied' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const coupons = await m.getBySchool(req.params.school_id); res.json({ coupons }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, validate, apply, list, remove };
