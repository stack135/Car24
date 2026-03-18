const express = require('express');
const router = express.Router();
const { Ride, Booking, Car, User } = require('../models');
const { protect, authorize } = require('../middleware/auth');

// Start ride
router.patch('/start/:bookingId', protect, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Check if booking exists and is confirmed
    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: User, as: 'user' },
        { model: Car, as: 'car' },
        { model: Ride, as: 'ride' }
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Check if user owns this booking or is staff
    if (booking.userId !== req.user.id && !['staff', 'branch_head', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to start this ride' });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Booking must be confirmed to start ride' });
    }

    // Check if ride already exists
    if (booking.ride) {
      if (booking.ride.rideStatus === 'active') {
        return res.status(400).json({ success: false, message: 'Ride is already active' });
      }
      if (booking.ride.rideStatus === 'completed') {
        return res.status(400).json({ success: false, message: 'Ride has already been completed' });
      }
    }

    // Validate ride start time is within reasonable range of pickup time
    const pickupDateTime = new Date(`${booking.pickupDate}T${booking.pickupTime}`);
    const now = new Date();
    const timeDiffHours = Math.abs(now - pickupDateTime) / (1000 * 60 * 60);

    if (timeDiffHours > 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ride can only be started within 2 hours of scheduled pickup time' 
      });
    }

    // Calculate expected end time based on booking duration
    const expectedEndTime = new Date(now.getTime() + booking.duration * 60 * 60 * 1000);

    let ride;
    if (booking.ride) {
      // Update existing ride
      ride = await booking.ride.update({
        rideStartTime: now,
        rideEndTime: expectedEndTime,
        rideStatus: 'active'
      });
    } else {
      // Create new ride
      ride = await Ride.create({
        bookingId,
        rideStartTime: now,
        rideEndTime: expectedEndTime,
        rideStatus: 'active'
      });
    }

    // Update booking status to active
    await booking.update({ status: 'active' });

    res.json({
      success: true,
      message: 'Ride started successfully',
      data: {
        ride,
        expectedEndTime: expectedEndTime.toISOString(),
        duration: `${booking.duration} hours`
      }
    });
  } catch (error) {
    console.error('Start ride error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// End ride
router.patch('/end/:bookingId', protect, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findByPk(bookingId, {
      include: [
        { model: User, as: 'user' },
        { model: Car, as: 'car' },
        { model: Ride, as: 'ride' }
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!booking.ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    // Check if user owns this booking or is staff
    if (booking.userId !== req.user.id && !['staff', 'branch_head', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to end this ride' });
    }

    if (booking.ride.rideStatus !== 'active') {
      return res.status(400).json({ success: false, message: 'Ride is not active' });
    }

    const actualReturnTime = new Date();
    const expectedEndTime = new Date(booking.ride.rideEndTime);
    const startTime = new Date(booking.ride.rideStartTime);

    // Calculate penalty if late
    let latePenalty = 0;
    if (actualReturnTime > expectedEndTime) {
      const lateMs = actualReturnTime - expectedEndTime;
      const lateHours = Math.ceil(lateMs / (1000 * 60 * 60));
      
      // Get car pricing for penalty calculation
      const { CarPricing } = require('../models');
      const pricing = await CarPricing.findOne({
        where: { carId: booking.carId, duration: 24, isActive: true }
      });
      
      if (pricing) {
        // Penalty: 15% of daily rate per hour late
        latePenalty = (parseFloat(pricing.price) * 0.15) * lateHours;
      }
    }

    // Calculate actual ride duration
    const rideDurationMs = actualReturnTime - startTime;
    const rideDurationHours = rideDurationMs / (1000 * 60 * 60);

    // Update ride
    const ride = await booking.ride.update({
      actualReturnTime,
      latePenalty: latePenalty.toFixed(2),
      rideStatus: 'completed'
    });

    // Update booking status
    await booking.update({ status: 'completed' });

    // Make car available again
    await booking.car.update({ isAvailable: true });

    res.json({
      success: true,
      message: 'Ride ended successfully',
      data: {
        ride,
        summary: {
          startTime: startTime.toISOString(),
          endTime: actualReturnTime.toISOString(),
          expectedEndTime: expectedEndTime.toISOString(),
          actualDuration: rideDurationHours.toFixed(2) + ' hours',
          scheduledDuration: booking.duration + ' hours',
          latePenalty: latePenalty.toFixed(2),
          isLate: actualReturnTime > expectedEndTime
        }
      }
    });
  } catch (error) {
    console.error('End ride error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get ride details
router.get('/:bookingId', protect, async (req, res) => {
  try {
    const ride = await Ride.findOne({
      where: { bookingId: req.params.bookingId },
      include: [
        {
          model: Booking,
          as: 'booking',
          include: [
            { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
            { model: Car, as: 'car' }
          ]
        }
      ]
    });

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    // Check if user owns this booking or is staff
    if (ride.booking.userId !== req.user.id && !['staff', 'branch_head', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this ride' });
    }

    // Calculate current duration if ride is active
    let currentDuration = 0;
    if (ride.rideStatus === 'active' && ride.rideStartTime) {
      const now = new Date();
      const startTime = new Date(ride.rideStartTime);
      const durationMs = now - startTime;
      currentDuration = durationMs / (1000 * 60 * 60);
    } else if (ride.actualReturnTime && ride.rideStartTime) {
      const startTime = new Date(ride.rideStartTime);
      const endTime = new Date(ride.actualReturnTime);
      const durationMs = endTime - startTime;
      currentDuration = durationMs / (1000 * 60 * 60);
    }

    res.json({
      success: true,
      data: {
        ...ride.toJSON(),
        currentDuration: currentDuration.toFixed(2) + ' hours'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all rides (Staff and above)
router.get('/', protect, authorize('staff', 'branch_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const rides = await Ride.findAll({
      include: [
        {
          model: Booking,
          as: 'booking',
          include: [
            { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
            { model: Car, as: 'car' }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, count: rides.length, data: rides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get active rides (Staff and above)
router.get('/active/list', protect, authorize('staff', 'branch_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const activeRides = await Ride.findAll({
      where: { rideStatus: 'active' },
      include: [
        {
          model: Booking,
          as: 'booking',
          include: [
            { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
            { model: Car, as: 'car' }
          ]
        }
      ],
      order: [['rideStartTime', 'ASC']]
    });

    // Add current duration and late status for each active ride
    const ridesWithStatus = activeRides.map(ride => {
      const now = new Date();
      const startTime = new Date(ride.rideStartTime);
      const expectedEndTime = new Date(ride.rideEndTime);
      const currentDuration = (now - startTime) / (1000 * 60 * 60);
      const isOverdue = now > expectedEndTime;
      const overdueHours = isOverdue ? Math.ceil((now - expectedEndTime) / (1000 * 60 * 60)) : 0;

      return {
        ...ride.toJSON(),
        currentDuration: currentDuration.toFixed(2) + ' hours',
        isOverdue,
        overdueHours
      };
    });

    res.json({ success: true, count: ridesWithStatus.length, data: ridesWithStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;