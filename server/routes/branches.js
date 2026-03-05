const express = require('express');
const router = express.Router();
const Branch = require('../models/Branch');
const { protect, authorize } = require('../middleware/auth');

// Get all branches
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: true });
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create branch (Admin, Super Admin)
router.post('/', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const branch = await Branch.create(req.body);
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update branch
router.put('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
