const express = require('express');
const router = express.Router();
const { Payment, Booking, User } = require('../models');
const { protect } = require('../middleware/auth');
const { paymentValidation, validate } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');

// Rate limiting for payment verification
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 payment requests per windowMs
  message: { success: false, message: 'Too many payment attempts, please try again later.' }
});

// Configure multer for payment screenshot upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/payment-screenshots/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
  }
});

// Verify advance payment
router.post('/verify', protect, paymentLimiter, upload.single('paymentScreenshot'), paymentValidation, validate, async (req, res) => {
  try {
    const { bookingId, transactionId, paymentMethod } = req.body;

    // Check if booking exists
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: User, as: 'user' }]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Check if user owns this booking
    if (booking.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to make payment for this booking' });
    }

    // Check if booking is in awaiting_payment status
    if (booking.status !== 'awaiting_payment') {
      return res.status(400).json({ success: false, message: 'Booking is not awaiting payment' });
    }

    // Check if payment has expired
    if (booking.paymentExpiresAt && new Date() > booking.paymentExpiresAt) {
      await booking.update({ status: 'cancelled' });
      return res.status(400).json({ success: false, message: 'Payment time has expired. Booking has been cancelled.' });
    }

    // Check for duplicate transaction ID
    const existingPayment = await Payment.findOne({ where: { transactionId } });
    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'Transaction ID already exists' });
    }

    // Create payment record
    const payment = await Payment.create({
      bookingId,
      userId: req.user.id,
      transactionId,
      amount: booking.advanceAmount,
      paymentMethod,
      paymentType: 'advance',
      paymentScreenshot: req.file ? req.file.filename : null,
      status: 'completed' // In real scenario, this would be 'pending' until verified
    });

    // Update booking status to confirmed
    await booking.update({ status: 'confirmed' });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        payment,
        booking: {
          id: booking.id,
          status: booking.status,
          confirmationNumber: booking.confirmationNumber
        }
      }
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Pay remaining amount
router.post('/pay-remaining', protect, paymentLimiter, upload.single('paymentScreenshot'), async (req, res) => {
  try {
    const { bookingId, transactionId, paymentMethod } = req.body;

    if (!bookingId || !transactionId || !paymentMethod) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Payment, as: 'payments' }]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (booking.status !== 'confirmed' && booking.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Invalid booking status for remaining payment' });
    }

    // Check if remaining payment already made
    const remainingPayment = booking.payments.find(p => p.paymentType === 'remaining');
    if (remainingPayment) {
      return res.status(400).json({ success: false, message: 'Remaining payment already completed' });
    }

    // Check for duplicate transaction ID
    const existingPayment = await Payment.findOne({ where: { transactionId } });
    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'Transaction ID already exists' });
    }

    // Create remaining payment record
    const payment = await Payment.create({
      bookingId,
      userId: req.user.id,
      transactionId,
      amount: booking.remainingAmount,
      paymentMethod,
      paymentType: 'remaining',
      paymentScreenshot: req.file ? req.file.filename : null,
      status: 'completed'
    });

    res.json({
      success: true,
      message: 'Remaining payment completed successfully',
      data: payment
    });
  } catch (error) {
    console.error('Remaining payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get payment history
router.get('/history', protect, async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: { userId: req.user.id },
      include: [{ model: Booking, as: 'booking' }],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all payments (Admin only)
router.get('/', protect, async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const payments = await Payment.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: Booking, as: 'booking' }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update payment status (Admin only)
router.patch('/:id/status', protect, async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const { status } = req.body;
    if (!['pending', 'completed', 'failed', 'refunded'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status' });
    }

    const payment = await Payment.findByPk(req.params.id, {
      include: [{ model: Booking, as: 'booking' }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    await payment.update({ status });

    // Update booking status based on payment status
    if (status === 'completed' && payment.paymentType === 'advance') {
      await payment.booking.update({ status: 'confirmed' });
    } else if (status === 'failed') {
      await payment.booking.update({ status: 'cancelled' });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;