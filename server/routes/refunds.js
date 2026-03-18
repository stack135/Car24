const express = require('express');
const router = express.Router();
const { Refund, Booking, Payment, User } = require('../models');
const { protect, authorize } = require('../middleware/auth');

// Get user refunds
router.get('/my-refunds', protect, async (req, res) => {
  try {
    const refunds = await Refund.findAll({
      include: [
        {
          model: Booking,
          as: 'booking',
          where: { userId: req.user.id },
          include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
        },
        { model: Payment, as: 'payment' }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: refunds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all refunds (Admin only)
router.get('/', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { status } = req.query;
    
    const whereClause = {};
    if (status) {
      whereClause.refundStatus = status;
    }

    const refunds = await Refund.findAll({
      where: whereClause,
      include: [
        {
          model: Booking,
          as: 'booking',
          include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }]
        },
        { model: Payment, as: 'payment' }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, count: refunds.length, data: refunds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get pending refunds (Admin only)
router.get('/pending', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const pendingRefunds = await Refund.findAll({
      where: { refundStatus: 'pending' },
      include: [
        {
          model: Booking,
          as: 'booking',
          include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }]
        },
        { model: Payment, as: 'payment' }
      ],
      order: [['createdAt', 'ASC']]
    });

    res.json({ success: true, count: pendingRefunds.length, data: pendingRefunds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Process refund (Admin only)
router.patch('/:id/process', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { refundTransactionId, refundStatus } = req.body;

    if (!['processed', 'failed'].includes(refundStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid refund status' });
    }

    const refund = await Refund.findByPk(req.params.id, {
      include: [
        { model: Booking, as: 'booking' },
        { model: Payment, as: 'payment' }
      ]
    });

    if (!refund) {
      return res.status(404).json({ success: false, message: 'Refund not found' });
    }

    if (refund.refundStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Refund is not in pending status' });
    }

    const updateData = {
      refundStatus,
      processedAt: new Date()
    };

    if (refundStatus === 'processed' && refundTransactionId) {
      updateData.refundTransactionId = refundTransactionId;
      
      // Update original payment status to refunded if fully refunded
      if (parseFloat(refund.refundAmount) >= parseFloat(refund.payment.amount)) {
        await refund.payment.update({ status: 'refunded' });
      }
    }

    await refund.update(updateData);

    res.json({
      success: true,
      message: `Refund ${refundStatus} successfully`,
      data: refund
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get refund details
router.get('/:id', protect, async (req, res) => {
  try {
    const refund = await Refund.findByPk(req.params.id, {
      include: [
        {
          model: Booking,
          as: 'booking',
          include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }]
        },
        { model: Payment, as: 'payment' }
      ]
    });

    if (!refund) {
      return res.status(404).json({ success: false, message: 'Refund not found' });
    }

    // Check if user owns this refund or is admin
    if (refund.booking.userId !== req.user.id && !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this refund' });
    }

    res.json({ success: true, data: refund });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create manual refund (Admin only)
router.post('/manual', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { bookingId, paymentId, refundAmount, refundReason } = req.body;

    if (!bookingId || !paymentId || !refundAmount || !refundReason) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Validate booking and payment exist
    const booking = await Booking.findByPk(bookingId);
    const payment = await Payment.findByPk(paymentId);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.bookingId !== booking.id) {
      return res.status(400).json({ success: false, message: 'Payment does not belong to this booking' });
    }

    // Check if refund amount is valid
    if (parseFloat(refundAmount) > parseFloat(payment.amount)) {
      return res.status(400).json({ success: false, message: 'Refund amount cannot exceed payment amount' });
    }

    // Check for existing refunds
    const existingRefunds = await Refund.findAll({ where: { paymentId } });
    const totalRefunded = existingRefunds.reduce((sum, refund) => sum + parseFloat(refund.refundAmount), 0);

    if (totalRefunded + parseFloat(refundAmount) > parseFloat(payment.amount)) {
      return res.status(400).json({ 
        success: false, 
        message: `Total refund amount would exceed payment amount. Already refunded: ${totalRefunded}` 
      });
    }

    const refund = await Refund.create({
      bookingId,
      paymentId,
      refundAmount: parseFloat(refundAmount).toFixed(2),
      refundReason,
      refundStatus: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Manual refund created successfully',
      data: refund
    });
  } catch (error) {
    console.error('Create manual refund error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get refund statistics (Admin only)
router.get('/stats/summary', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { sequelize } = require('../models');

    const totalRefunds = await Refund.count();
    const pendingRefunds = await Refund.count({ where: { refundStatus: 'pending' } });
    const processedRefunds = await Refund.count({ where: { refundStatus: 'processed' } });
    const failedRefunds = await Refund.count({ where: { refundStatus: 'failed' } });

    const totalRefundAmount = await Refund.sum('refundAmount', { where: { refundStatus: 'processed' } }) || 0;
    const pendingRefundAmount = await Refund.sum('refundAmount', { where: { refundStatus: 'pending' } }) || 0;

    // Refunds by reason
    const refundsByReason = await Refund.findAll({
      attributes: [
        'refundReason',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('refundAmount')), 'totalAmount']
      ],
      group: ['refundReason'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
    });

    const stats = {
      totalRefunds,
      pendingRefunds,
      processedRefunds,
      failedRefunds,
      totalRefundAmount: parseFloat(totalRefundAmount).toFixed(2),
      pendingRefundAmount: parseFloat(pendingRefundAmount).toFixed(2),
      refundsByReason
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;