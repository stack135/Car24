const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const { protect, authorize } = require('../middleware/auth');

// Get user bookings
router.get('/my-bookings', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('carId')
      .populate('branchId')
      .sort('-createdAt');
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all bookings (Staff and above)
router.get('/', protect, authorize('staff', 'branch_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('userId', 'firstName lastName email')
      .populate('carId')
      .populate('branchId')
      .sort('-createdAt');
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create booking
router.post('/', protect, async (req, res) => {
  try {
    const confirmationNumber = 'CAR24-' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    const booking = await Booking.create({
      ...req.body,
      userId: req.body.userId || req.user._id,
      confirmationNumber,
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update booking status
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    res.json({ success: true, data: booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel booking
router.delete('/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId.toString() !== req.user._id.toString() && 
        !['staff', 'branch_head', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
