const { createSchool, findSchoolBySubdomain, findSchoolById, getAllSchools } = require('../models/school.model');

const registerSchool = async (req, res) => {
  try {
    const { name, email, phone, address, subdomain } = req.body;
    if (!name || !email || !subdomain) {
      return res.status(400).json({ error: 'Name, email and subdomain are required' });
    }
    const existing = await findSchoolBySubdomain(subdomain);
    if (existing) return res.status(400).json({ error: 'Subdomain already taken' });

    const school = await createSchool({ name, email, phone, address, subdomain });
    res.status(201).json({ school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getSchool = async (req, res) => {
  try {
    const school = await findSchoolById(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json({ school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listSchools = async (req, res) => {
  try {
    const schools = await getAllSchools();
    res.json({ schools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { registerSchool, getSchool, listSchools };
