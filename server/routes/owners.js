const express = require('express');
const router = express.Router();
const { Owner, User, Car, Booking, sequelize } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { ownerValidation, validate } = require('../middleware/validation');

// ============ SPECIFIC ROUTES (BEFORE GENERIC ROUTES) ============

// ✅ POST /register - Register as owner
// ✅ TEST ENDPOINT - Create car with hardcoded owner ID
router.post('/test/:ownerId', protect, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const ownerId = parseInt(req.params.ownerId);
    
    console.log('🧪 TEST: Creating car with ownerId:', ownerId);
    
    // Minimal car data for testing
    const testCar = await Car.create({
      branchId: 1,
      ownerId: ownerId,
      make: 'Test',
      model: 'Car',
      year: 2023,
      category: 'SUV',
      transmission: 'automatic',
      fuelType: 'petrol',
      seatingCapacity: 5,
      pricePerTrip: 1000,
      licensePlate: `TEST${Date.now()}`,
      color: 'Red',
      licenseDocument: 'http://test.com/doc.pdf',
      ownerPanNumber: 'ABCDE1234F',
      ownerBankAccount: '1234567890',
      ownerIfscCode: 'SBIN0012345',
      ownerBankName: 'SBI',
      ownerUpiId: 'test@ybl'
    }, { transaction });
    
    await transaction.commit();
    
    res.json({
      success: true,
      message: 'Test car created',
      data: testCar
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Test error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post('/register', protect, ownerValidation, validate, async (req, res) => {
  try {
    const { businessName, businessLicense, panNumber, gstNumber, bankAccountNumber, ifscCode, upiId } = req.body;

    // Check if user is already an owner
    const existingOwner = await Owner.findOne({ where: { userId: req.user.id } });
    if (existingOwner) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is already registered as an owner' 
      });
    }

    const owner = await Owner.create({
      userId: req.user.id,
      businessName,
      businessLicense,
      panNumber,
      gstNumber,
      bankAccountNumber,
      ifscCode,
      upiId,
      approvalStatus: 'pending'
    });

    // Update user role to owner
    await req.user.update({ role: 'owner' });

    res.status(201).json({
      success: true,
      message: 'Owner registration submitted for approval',
      data: owner
    });
  } catch (error) {
    console.error('Owner registration error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ GET /pending - Get pending owner approvals (Admin only)
router.get('/pending', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const pendingOwners = await Owner.findAll({
      where: { approvalStatus: 'pending' },
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] 
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    res.json({ 
      success: true, 
      count: pendingOwners.length, 
      data: pendingOwners 
    });
  } catch (error) {
    console.error('Get pending owners error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ GET /stats - Get owner statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const owner = await Owner.findOne({ where: { userId: req.user.id } });

    if (!owner) {
      return res.status(404).json({ 
        success: false, 
        message: 'Owner profile not found' 
      });
    }

    const totalCars = await Car.count({ where: { ownerId: owner.id } });
    const approvedCars = await Car.count({ where: { ownerId: owner.id, approvalStatus: 'approved' } });
    const pendingCars = totalCars - approvedCars;
    
    const totalBookings = await Booking.count({
      include: [{  
        model: Car, 
        as: 'car', 
        where: { ownerId: owner.id }, 
        required: true 
      }]
    });

    res.json({ 
      success: true, 
      data: { 
        totalCars, 
        approvedCars, 
        pendingCars, 
        totalBookings, 
        approvalStatus: owner.approvalStatus 
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ GET /profile - Get owner profile
router.get('/profile', protect, async (req, res) => {
  try {
    const owner = await Owner.findOne({
      where: { userId: req.user.id },
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] 
        },
        { 
          model: Car, 
          as: 'cars' 
        }
      ]
    });

    if (!owner) {
      return res.status(404).json({ 
        success: false, 
        message: 'Owner profile not found' 
      });
    }

    res.json({ success: true, data: owner });
  } catch (error) {
    console.error('Get owner profile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ PUT /profile - Update owner profile
router.put('/profile', protect, async (req, res) => {
  try {
    const owner = await Owner.findOne({ where: { userId: req.user.id } });

    if (!owner) {
      return res.status(404).json({ 
        success: false, 
        message: 'Owner profile not found' 
      });
    }

    if (owner.approvalStatus === 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot update approved owner profile. Contact admin for changes.' 
      });
    }

    const { businessName, businessLicense, panNumber, gstNumber, bankAccountNumber, ifscCode, upiId } = req.body;

    await owner.update({
      businessName: businessName || owner.businessName,
      businessLicense: businessLicense || owner.businessLicense,
      panNumber: panNumber || owner.panNumber,
      gstNumber: gstNumber || owner.gstNumber,
      bankAccountNumber: bankAccountNumber || owner.bankAccountNumber,
      ifscCode: ifscCode || owner.ifscCode,
      upiId: upiId || owner.upiId,
      approvalStatus: 'pending' // Reset to pending after update
    });

    res.json({
      success: true,
      message: 'Owner profile updated and submitted for re-approval',
      data: owner
    });
  } catch (error) {
    console.error('Owner profile update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ PATCH /:id/approval - Approve/Reject owner (Admin only)
// Find and update the PATCH /:id/approval route:

// ✅ PATCH /:id/approval - Approve/Reject owner (Admin only)
router.patch('/:id/approval', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { approvalStatus, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(approvalStatus)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid approval status. Must be "approved" or "rejected"' 
      });
    }

    // ✅ If rejecting, reason is required
    if (approvalStatus === 'rejected' && !rejectionReason) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rejection reason is required' 
      });
    }

    const owner = await Owner.findByPk(req.params.id, {
      include: [{ model: User, as: 'user' }]
    });

    if (!owner) {
      return res.status(404).json({ 
        success: false, 
        message: 'Owner not found' 
      });
    }

    console.log(`📋 Admin approval: Owner ${owner.id} status changing to "${approvalStatus}"`);

    // ✅ Update owner with approval status
    await owner.update({
      approvalStatus,
      rejectionReason: approvalStatus === 'rejected' ? rejectionReason : null,
      isActive: approvalStatus === 'approved' // ✅ Set isActive when approved
    });

    // ✅ Update user status based on approval
    if (approvalStatus === 'approved') {
      await owner.user.update({ 
        isActive: true,
        role: 'owner'  // ✅ Ensure role is owner
      });
      console.log(`✅ Owner ${owner.id} APPROVED - can now create cars`);
    } else if (approvalStatus === 'rejected') {
      await owner.user.update({ 
        isActive: false,
        role: 'user'   // ✅ Revert role back to user
      });
      console.log(`❌ Owner ${owner.id} REJECTED - cannot create cars`);
    }

    res.json({
      success: true,
      message: `Owner ${approvalStatus} successfully`,
      data: owner
    });
  } catch (error) {
    console.error('❌ Owner approval error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ GENERIC ROUTES (AFTER SPECIFIC ROUTES) ============

// ✅ GET / - Get all owners (Admin only)
router.get('/', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const owners = await Owner.findAll({
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] 
        },
        { 
          model: Car, 
          as: 'cars' 
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ 
      success: true, 
      count: owners.length, 
      data: owners 
    });
  } catch (error) {
    console.error('Get all owners error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ GET /:id - Get single owner (Admin only)
router.get('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const owner = await Owner.findByPk(req.params.id, {
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] 
        },
        { 
          model: Car, 
          as: 'cars' 
        }
      ]
    });

    if (!owner) {
      return res.status(404).json({ 
        success: false, 
        message: 'Owner not found' 
      });
    }

    res.json({ success: true, data: owner });
  } catch (error) {
    console.error('Get owner by ID error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;