const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUser, findUserByEmail } = require('../models/user.model');

const register = async (req, res) => {
  try {
    const { school_id, full_name, email, password, role } = req.body;
    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const existing = await findUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const user = await createUser({ school_id, full_name, email, password, role });
    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        school_id: user.school_id,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { register, login };
