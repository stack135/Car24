const express = require('express');
const router = express.Router();
const { Booking, User, Car, Branch, CarPricing, Payment, sequelize } = require('../models');
const { Op } = require('sequelize');
const { protect, authorize } = require('../middleware/auth');
const { bookingValidation, validate } = require('../middleware/validation');
const QRCodeGenerator = require('../utils/qrGenerator');
const rateLimit = require('express-rate-limit');

// Helper functions for date/time parsing
function parseDate(dateStr) {
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // Handle DD/MM/YYYY or MM/DD/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  throw new Error('Invalid date format');
}

function normalizeTime(timeStr) {
  if (!timeStr) return null;
  
  // Handle HH:MM format (add seconds)
  const timeStr_trimmed = timeStr.toString().trim();
  
  // If it's already HH:MM:SS format
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr_trimmed)) {
    return timeStr_trimmed;
  }
  
  // If it's HH:MM format
  const match = timeStr_trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}:00`;
  }
  
  return timeStr_trimmed;
}

function calculateDropoff(pickupDate, pickupTime, duration) {
  try {
    // Validate inputs
    if (!pickupDate) throw new Error('Pickup date is required');
    if (!pickupTime) throw new Error('Pickup time is required');
    if (!duration || isNaN(duration)) throw new Error('Valid duration is required');

    // Normalize time format
    const normalizedTime = normalizeTime(pickupTime);
    if (!normalizedTime) {
      throw new Error(`Invalid time format: ${pickupTime}`);
    }

    // Create datetime string
    const dateTimeString = `${pickupDate}T${normalizedTime}`;
    console.log('Creating datetime from:', dateTimeString);

    // Parse the date
    const pickupDateTime = new Date(dateTimeString);
    
    // Validate the parsed date
    if (isNaN(pickupDateTime.getTime())) {
      throw new Error(`Failed to parse datetime: ${dateTimeString}`);
    }

    // Calculate dropoff
    const dropoffDateTime = new Date(pickupDateTime.getTime() + duration * 60 * 60 * 1000);
    
    if (isNaN(dropoffDateTime.getTime())) {
      throw new Error('Failed to calculate dropoff time');
    }

    // Format dropoff date and time separately
    const dropoffDate = dropoffDateTime.toISOString().split('T')[0];
    const dropoffTime = dropoffDateTime.toTimeString().split(' ')[0]; // Gets HH:MM:SS
    
    return { dropoffDate, dropoffTime };
  } catch (error) {
    console.error('calculateDropoff error:', {
      pickupDate,
      pickupTime,
      duration,
      error: error.message
    });
    throw error;
  }
}
// Rate limiting for booking creation
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 booking requests per windowMs
  message: { success: false, message: 'Too many booking attempts, please try again later.' }
});

// Get user bookings
router.get('/my-bookings', protect, async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      where: { userId: req.user.id },
      include: [
        { model: Car, as: 'car' },
        { model: Branch, as: 'branch' },
        { model: Payment, as: 'payments' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all bookings (Staff and above)
router.get('/', protect, authorize('staff', 'branch_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: Car, as: 'car' },
        { model: Branch, as: 'branch' },
        { model: Payment, as: 'payments' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create booking with QR payment
router.post('/', protect, bookingLimiter, bookingValidation, validate, async (req, res) => {
  try {
    let { carId, branchId, pickupDate, pickupTime, dropoffDate, dropoffTime, duration, pickupLocation, dropoffLocation } = req.body;
    
    // Parse and normalize dates/times
    const parsedPickupDate = parseDate(pickupDate);
    const normalizedPickupTime = normalizeTime(pickupTime);
    
    // Calculate dropoff (don't trust client values)
    const { dropoffDate: calculatedDropoffDate, dropoffTime: calculatedDropoffTime } = calculateDropoff(parsedPickupDate, normalizedPickupTime, duration);
    
    // Use calculated values
    dropoffDate = calculatedDropoffDate;
    dropoffTime = calculatedDropoffTime;
    // Check if car exists and is available
    const car = await Car.findByPk(carId, {
      include: [{ model: CarPricing, as: 'pricing', where: { duration, isActive: true } }]
    });

    if (!car) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }

    if (!car.isAvailable || car.approvalStatus !== 'approved') {
      return res.status(400).json({ success: false, message: 'Car is not available for booking' });
    }

    // Check for conflicting bookings (time-aware)
    const conflictingBooking = await Booking.findOne({
      where: {
        carId,
        status: { [Op.in]: ['confirmed', 'active'] },
        [Op.or]: [
          {
            [Op.and]: [
              sequelize.where(
                sequelize.fn('CONCAT', sequelize.col('pickupDate'), ' ', sequelize.col('pickupTime')), 
                { [Op.lte]: `${dropoffDate} ${dropoffTime}` }
              ),
              sequelize.where(
                sequelize.col('dropoffDate'), 
                { [Op.gte]: parsedPickupDate }
              )
            ]
          }
        ]
      }
    });

    if (conflictingBooking) {
      return res.status(400).json({ success: false, message: 'Car is already booked for the selected time period' });
    }

    // Get pricing
    const pricing = car.pricing[0];
    if (!pricing) {
      return res.status(400).json({ success: false, message: `No pricing found for ${duration} hour duration` });
    }

    const totalPrice = parseFloat(pricing.price);
    const advanceAmount = totalPrice * 0.2; // 20% advance
    const remainingAmount = totalPrice - advanceAmount;

    // Set payment expiry (10 minutes from now)
    const paymentExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const confirmationNumber = 'CAR24-' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();

    // Create booking
    const booking = await Booking.create({
      userId: req.user.id,
      carId,
      branchId,
      pickupDate: new Date(parsedPickupDate),
      pickupTime: normalizedPickupTime,
      dropoffDate: new Date(dropoffDate),
      dropoffTime,
      duration,
      pickupLocation,
      dropoffLocation,
      totalPrice: totalPrice.toFixed(2),
      advanceAmount: advanceAmount.toFixed(2),
      remainingAmount: remainingAmount.toFixed(2),
      status: 'awaiting_payment',
      paymentExpiresAt,
      confirmationNumber,
      createdBy: req.user.id
    });

    // Generate QR code for advance payment
    const companyUPI = process.env.COMPANY_UPI_ID || 'car24@paytm';
    const companyName = process.env.COMPANY_NAME || 'Car24 Travels';

    const qrData = await QRCodeGenerator.generatePaymentQR(
      '6281704664@ybl',
      'car24 Travels',
      advanceAmount.toFixed(2),
      booking.id
    );

    // Defensive check for QR generation
    if (!qrData) {
      throw new Error('QR code generation failed - no data returned');
    }
    console.log('QR Data generated:', JSON.stringify({ 
      hasData: !!qrData.data, 
      keys: Object.keys(qrData),
      upiApps: !!qrData.upiApps 
    }, null, 2));

    // Update booking with QR data
    await booking.update({
      qrCode: qrData.qrCode,
      upiLink: qrData.upiLink
    });

    res.status(201).json({
      success: true,
      data: booking,
      payment: {
        qrCode: qrData.qrCode,
        upiLink: qrData.upiLink,
        amount: advanceAmount.toFixed(2),
        expiresAt: paymentExpiresAt,
        instructions: 'Scan QR code or use UPI link to pay advance amount. Payment must be completed within 10 minutes.',
        upiApps: qrData?.upiApps || [],
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update booking status with proper validation and business logic
// Update booking status with proper validation and business logic
router.patch('/:bookingId/status', protect, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, cancellationReason } = req.body;

    // Validate bookingId
    if (!bookingId || isNaN(parseInt(bookingId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid booking ID is required'
      });
    }

    // Define valid status transitions based on current status
    // INCLUDING 'awaiting_payment' as a valid status
    const validStatuses = {
      awaiting_payment: ['confirmed', 'cancelled'], // Staff can confirm or cancel from awaiting_payment
      confirmed: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [], // No further updates allowed
      cancelled: [] // No further updates allowed
    };

    // Validate status input
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    // Check if status is valid
    const allValidStatuses = Object.keys(validStatuses);
    if (!allValidStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status value. Must be one of: ${allValidStatuses.join(', ')}`
      });
    }

    // Find booking with associated car and user details
    const booking = await Booking.findByPk(bookingId, {
      include: [
        { 
          model: Car, 
          as: 'car',
          attributes: ['id', 'make', 'model', 'licensePlate', 'status', 'isAvailable']
        },
        { 
          model: User, 
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Payment,
          as: 'payments',
          required: false,
          where: { status: 'completed' },
          limit: 1
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Authorization check
    const isOwner = booking.userId === req.user.id;
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isBranchStaff = ['branch_head', 'staff'].includes(req.user.role);
    const isStaff = isAdmin || isBranchStaff;

    // Special handling for awaiting_payment status
    if (booking.status === 'awaiting_payment') {
      // Only staff can update from awaiting_payment
      if (!isStaff) {
        return res.status(403).json({
          success: false,
          message: 'Only staff members can confirm or cancel bookings after payment verification'
        });
      }
      
      // Validate that status is either confirmed or cancelled
      if (!['confirmed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'From awaiting_payment, status can only be changed to confirmed or cancelled'
        });
      }
    } else {
      // For other statuses, check regular authorization
      if (!isOwner && !isStaff) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this booking status'
        });
      }
    }

    // Check if current status allows transition to requested status
    const allowedTransitions = validStatuses[booking.status] || [];
    
    if (!allowedTransitions.includes(status) && booking.status !== status) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition booking from '${booking.status}' to '${status}'. Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`
      });
    }

    // Additional business logic validations
    const now = new Date();

    // Prevent updating completed or cancelled bookings
    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update status of ${booking.status} bookings`
      });
    }

    // Special validations based on target status
    if (status === 'confirmed') {
      // Check if booking is in a state that can be confirmed
      if (!['awaiting_payment', 'pending'].includes(booking.status)) {
        return res.status(400).json({
          success: false,
          message: 'Only bookings awaiting payment can be confirmed'
        });
      }
      
      // Check if payment was made (optional - you can implement payment verification)
      // if (booking.status === 'awaiting_payment' && (!booking.payments || booking.payments.length === 0)) {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Cannot confirm booking without payment verification'
      //   });
      // }

      // Check if payment is within expiry time
      if (booking.paymentExpiresAt && new Date(booking.paymentExpiresAt) < now) {
        return res.status(400).json({
          success: false,
          message: 'Payment period has expired. Please ask customer to create a new booking.'
        });
      }

      // Update car status when booking is confirmed
      if (booking.car) {
        await booking.car.update({ 
          status: 'reserved',
          isAvailable: false 
        });
      }
    }

    if (status === 'active') {
      if (booking.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: 'Only confirmed bookings can be activated'
        });
      }

      // Check if booking dates are valid for activation
      const pickupDateTime = new Date(`${booking.pickupDate.toISOString().split('T')[0]}T${booking.pickupTime}`);
      if (pickupDateTime > now) {
        return res.status(400).json({
          success: false,
          message: 'Cannot activate booking before pickup date/time'
        });
      }

      // Update car status when booking is activated
      if (booking.car) {
        await booking.car.update({ 
          status: 'rented',
          isAvailable: false 
        });
      }
    }

    if (status === 'completed') {
      if (booking.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Only active bookings can be completed'
        });
      }

      // Update car availability when booking is completed
      if (booking.car) {
        await booking.car.update({ 
          status: 'available',
          isAvailable: true 
        });
      }
    }

    if (status === 'cancelled') {
      // Add cancellation reason if needed
      if (!cancellationReason) {
        return res.status(400).json({
          success: false,
          message: 'Cancellation reason is required when cancelling a booking'
        });
      }

      // If booking was confirmed or active, make car available again
      if (['confirmed', 'active', 'awaiting_payment'].includes(booking.status) && booking.car) {
        await booking.car.update({ 
          status: 'available',
          isAvailable: true 
        });
      }

      // Calculate refund if payment was made
      if (booking.payments && booking.payments.length > 0) {
        const paidAmount = parseFloat(booking.payments[0].amount);
        // You can implement refund logic here
        console.log(`Refund of ${paidAmount} to be processed for booking ${booking.id}`);
      }
    }

    // Prepare update data
    const updateData = { 
      status,
      updatedBy: req.user.id
    };

    // Add cancellation reason if provided
    if (status === 'cancelled' && cancellationReason) {
      updateData.cancellationReason = cancellationReason;
      updateData.cancelledAt = now;
    }

    // Add completion timestamp
    if (status === 'completed') {
      updateData.completedAt = now;
    }

    // Add confirmation timestamp
    if (status === 'confirmed' && booking.status === 'awaiting_payment') {
      updateData.confirmedAt = now;
      updateData.confirmedBy = req.user.id;
    }

    // Add activation timestamp
    if (status === 'active') {
      updateData.activatedAt = now;
      updateData.activatedBy = req.user.id;
    }

    // Update booking
    await booking.update(updateData);

    // Fetch updated booking with associations
    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [
        { 
          model: Car, 
          as: 'car',
          attributes: ['id', 'make', 'model', 'licensePlate', 'status', 'isAvailable']
        },
        { 
          model: User, 
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        },
        {
          model: Payment,
          as: 'payments',
          attributes: ['id', 'amount', 'status', 'paymentMethod']
        }
      ]
    });

    // Prepare response message
    let message = `Booking status updated to ${status}`;
    if (status === 'cancelled' && cancellationReason) {
      message += ` (Reason: ${cancellationReason})`;
    }

    res.json({
      success: true,
      message,
      data: {
        booking: updatedBooking,
        statusHistory: {
          from: booking.status,
          to: status,
          updatedAt: now,
          updatedBy: req.user.id
        }
      }
    });

  } catch (error) {
    console.error('Update booking status error:', {
      message: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
      user: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get booking by ID
// Get booking by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid booking ID is required'
      });
    }

    // Find booking with all relevant associations
    const booking = await Booking.findByPk(id, {
      include: [
        { 
          model: Car, 
          as: 'car',
          required: false,
          attributes: [
            'id', 'make', 'model', 'year', 'category', 
            'transmission', 'fuelType', 'seatingCapacity',
            'pricePerTrip', 'licensePlate', 'color', 
            'images', 'features', 'mileage', 'status',
            'isAvailable', 'rating'
          ],
          include: [
            {
              model: Branch,
              as: 'branch',
              attributes: ['id', 'name', 'city', 'state', 'address', 'phone']
            },
            {
              model: Owner,
              as: 'owner',
              attributes: ['id', 'userId'],
              include: [
                {
                  model: User,
                  as: 'user',
                  attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
                }
              ]
            }
          ]
        },
        { 
          model: User, 
          as: 'user',
          required: false,
          attributes: [
            'id', 'firstName', 'lastName', 'email', 'phone',
            'profileImage', 'address', 'city', 'state', 'zipCode'
          ]
        },
        {
          model: User,
          as: 'driver',
          required: false,
          attributes: [
            'id', 'firstName', 'lastName', 'email', 'phone',
            'profileImage', 'driverLicense', 'driverLicenseImage'
          ]
        },
        {
          model: Payment,
          as: 'payment',
          required: false,
          attributes: [
            'id', 'amount', 'status', 'paymentMethod',
            'transactionId', 'paymentDate', 'refundAmount',
            'refundStatus', 'refundDate'
          ]
        }
      ],
      attributes: {
        include: [
          // Include calculated fields if needed
          [sequelize.literal(`CASE 
            WHEN "Booking"."endDate" < NOW() AND "Booking"."status" = 'active' 
            THEN 'overdue' 
            ELSE "Booking"."status" 
          END`), 'calculatedStatus']
        ]
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Authorization check
    const isOwner = booking.userId === req.user.id;
    const isDriver = booking.driverId === req.user.id;
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isBranchStaff = ['branch_head', 'staff'].includes(req.user.role);
    const isCarOwner = booking.car?.owner?.userId === req.user.id;

    if (!isOwner && !isDriver && !isAdmin && !isBranchStaff && !isCarOwner) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this booking'
      });
    }

    // Calculate additional booking details
    const now = new Date();
    const startDate = new Date(booking.startDate);
    const endDate = new Date(booking.endDate);
    
    // Calculate duration in days
    const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Calculate total amount if not already calculated
    const totalAmount = booking.totalAmount || 
      (durationDays * (booking.car?.pricePerTrip || 0));

    // Check if booking is upcoming, active, or past
    let bookingPeriod = 'unknown';
    if (now < startDate) bookingPeriod = 'upcoming';
    else if (now >= startDate && now <= endDate) bookingPeriod = 'active';
    else if (now > endDate) bookingPeriod = 'past';

    // Check if review is allowed
    const canReview = bookingPeriod === 'past' && 
                     booking.status === 'completed' && 
                     !booking.reviewed;

    // Prepare response data with additional calculated fields
    const bookingData = {
      ...booking.toJSON(),
      calculatedFields: {
        durationDays,
        totalAmount,
        bookingPeriod,
        canReview,
        isOverdue: booking.status === 'active' && now > endDate,
        daysUntilStart: Math.ceil((startDate - now) / (1000 * 60 * 60 * 24)),
        daysUntilEnd: Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
      }
    };

    // Remove sensitive information based on user role
    // Mask sensitive information based on user role
if (!isAdmin && !isBranchStaff && !isCarOwner) {
  try {
    // Mask owner contact info for regular users
    if (bookingData.car?.owner?.user) {
      const ownerUser = bookingData.car.owner.user;
      
      // Only mask if the current user is NOT the owner
      if (ownerUser.id !== req.user.id) {
        ownerUser.email = maskEmail(ownerUser.email);
        ownerUser.phone = maskPhone(ownerUser.phone);
        
        // Optionally remove other sensitive fields
        delete ownerUser.address;
        delete ownerUser.city;
        delete ownerUser.state;
        delete ownerUser.zipCode;
        delete ownerUser.driverLicense;
        delete ownerUser.driverLicenseImage;
      }
    }
    
    // Mask user contact info for non-owners
    if (bookingData.user && !isOwner) {
      const bookingUser = bookingData.user;
      
      // Only mask if the current user is NOT the booking user
      if (bookingUser.id !== req.user.id) {
        bookingUser.email = maskEmail(bookingUser.email);
        bookingUser.phone = maskPhone(bookingUser.phone);
        
        // Optionally remove other sensitive fields
        delete bookingUser.address;
        delete bookingUser.city;
        delete bookingUser.state;
        delete bookingUser.zipCode;
        delete bookingUser.driverLicense;
        delete bookingUser.driverLicenseImage;
      }
    }
    
    // Mask driver contact info if exists and not the current user
    if (bookingData.driver && bookingData.driver.id !== req.user.id) {
      bookingData.driver.email = maskEmail(bookingData.driver.email);
      bookingData.driver.phone = maskPhone(bookingData.driver.phone);
      
      // Remove sensitive driver fields
      delete bookingData.driver.driverLicense;
      delete bookingData.driver.driverLicenseImage;
      delete bookingData.driver.address;
    }
    
  } catch (maskError) {
    console.error('Error masking sensitive data:', maskError);
    // Continue with the response even if masking fails
  }
}

    res.json({
      success: true,
      data: bookingData
    });

  } catch (error) {
    console.error('Get booking error:', {
      message: error.message,
      stack: error.stack,
      bookingId: req.params.id,
      user: req.user?.id
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper functions for masking sensitive data
function maskEmail(email) {
  if (!email) return null;
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.charAt(0) + '***' + localPart.charAt(localPart.length - 1);
  return `${maskedLocal}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  return phone.replace(/(\d{2})\d{4,}(\d{2})/, '$1****$2');
}
// Cancel booking
router.delete('/:id/cancel', protect, async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id, {
      include: [{ model: Payment, as: 'payments', where: { status: 'completed' } }]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Check if user owns this booking or is staff
    if (booking.userId !== req.user.id && !['staff', 'branch_head', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this booking' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
    }

    if (booking.status === 'active') {
      return res.status(400).json({ success: false, message: 'Cannot cancel active booking' });
    }

    // Calculate refund amount based on cancellation rules
    let refundAmount = 0;
    let refundReason = '';

    if (booking.payments && booking.payments.length > 0) {
      const pickupDateTime = new Date(`${booking.pickupDate}T${booking.pickupTime}`);
      const now = new Date();
      const hoursUntilPickup = (pickupDateTime - now) / (1000 * 60 * 60);

      const paidAmount = booking.payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);

      if (hoursUntilPickup > 24) {
        refundAmount = paidAmount; // 100% refund
        refundReason = 'Cancelled more than 24 hours before pickup';
      } else if (hoursUntilPickup > 12) {
        refundAmount = paidAmount * 0.5; // 50% refund
        refundReason = 'Cancelled 12-24 hours before pickup';
      } else {
        refundAmount = 0; // No refund
        refundReason = 'Cancelled less than 12 hours before pickup';
      }
    }

    // Update booking status
    await booking.update({ status: 'cancelled' });

    // Create refund record if applicable
    if (refundAmount > 0 && booking.payments && booking.payments.length > 0) {
      const { Refund } = require('../models');
      await Refund.create({
        bookingId: booking.id,
        paymentId: booking.payments[0].id,
        refundAmount: refundAmount.toFixed(2),
        refundReason,
        refundStatus: 'pending'
      });
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      refund: {
        amount: refundAmount.toFixed(2),
        reason: refundReason,
        status: refundAmount > 0 ? 'pending' : 'not_applicable'
      }
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;