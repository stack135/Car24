const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const { protect } = require('../middleware/auth');

// Create payment
router.post('/', protect, async (req, res) => {
  try {
    const payment = await Payment.create({
      ...req.body,
      userId: req.user._id,
      transactionId: 'TXN-' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase()
    });
    
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get payment by booking
router.get('/booking/:bookingId', protect, async (req, res) => {
  try {
    const payment = await Payment.findOne({ bookingId: req.params.bookingId });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
