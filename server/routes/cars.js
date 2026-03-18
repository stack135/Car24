const express = require('express');
const router = express.Router();
const { Car, Branch, Owner, User } = require('../models');
const { Op } = require('sequelize');
const { protect, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { sequelize } = require('../models');

// ============ VALIDATION RULES ============
const carValidationRules = [
  body('branchId')
    .notEmpty().withMessage('Branch ID is required')
    .isInt().withMessage('Branch ID must be a number')
    .toInt(),
  body('make')
    .notEmpty().withMessage('Make is required')
    .isLength({ min: 2, max: 50 }).withMessage('Make must be between 2 and 50 characters'),
  body('model')
    .notEmpty().withMessage('Model is required')
    .isLength({ min: 1, max: 50 }).withMessage('Model must be between 1 and 50 characters'),
  body('year')
    .isInt({ min: 1990, max: new Date().getFullYear() + 1 }).withMessage('Invalid year')
    .toInt(),
  body('category')
    .notEmpty().withMessage('Category is required')
    .isLength({ min: 1, max: 50 }).withMessage('Category must be between 1 and 50 characters'),
  body('transmission')
    .isIn(['automatic', 'manual']).withMessage('Transmission must be automatic or manual'),
  body('fuelType')
    .isIn(['petrol', 'diesel', 'electric', 'hybrid', 'cng']).withMessage('Invalid fuel type'),
  body('seatingCapacity')
    .isInt({ min: 2, max: 15 }).withMessage('Seating capacity must be between 2 and 15')
    .toInt(),
  body('pricePerTrip')
    .isFloat({ min: 0.01 }).withMessage('Price must be positive')
    .toFloat(),
  body('licensePlate')
    .notEmpty().withMessage('License plate is required')
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('License plate must be 2-20 characters')
    .matches(/^[A-Z0-9\s\-]+$/)
    .withMessage('License plate format: letters, numbers, spaces, hyphens only')
    .toUpperCase(),
  body('color')
    .notEmpty().withMessage('Color is required')
    .isLength({ min: 2, max: 30 }).withMessage('Color must be between 2 and 30 characters'),
  body('licenseDocument')
    .notEmpty().withMessage('License document is required')
    .isURL().withMessage('Valid license document URL is required'),
  body('ownerPanNumber')
    .notEmpty().withMessage('PAN number is required')
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN number format'),
  body('ownerBankAccount')
    .notEmpty().withMessage('Bank account is required')
    .isNumeric().withMessage('Bank account must be numeric')
    .isLength({ min: 9, max: 18 }).withMessage('Bank account must be between 9 and 18 characters'),
  body('ownerIfscCode')
    .notEmpty().withMessage('IFSC code is required')
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC code format'),
  body('ownerBankName')
    .notEmpty().withMessage('Bank name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Bank name must be between 2 and 100 characters'),
  body('ownerUpiId')
    .notEmpty().withMessage('UPI ID is required')
    .matches(/^[\w.-]+@[\w.-]+$/).withMessage('Invalid UPI ID format'),
  body('images')
    .optional()
    .custom((value) => {
      if (!value) return true; // Allow empty
      if (Array.isArray(value)) return true; // Allow arrays
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
          return true; // Allow valid JSON strings
        } catch (e) {
          return true; // Allow other strings, we'll handle parsing in route
        }
      }
      return true; // Allow other types
    }),
  body('features')
    .optional()
    .custom((value) => {
      if (!value) return true;
      if (Array.isArray(value)) return true;
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
          return true;
        } catch (e) {
          return true;
        }
      }
      return true;
    }),
  body('mileage')
    .optional()
    .isInt({ min: 0 }).withMessage('Mileage must be a non-negative integer')
    .toInt()
];

// ============ SPECIFIC ROUTES (BEFORE GENERIC ROUTES) ============

// ✅ Get available colors for a model
router.get('/colors/:make/:model', async (req, res) => {
  try {
    const { make, model } = req.params;
    
    const cars = await Car.findAll({
      where: { 
        make,
        model,
        approvalStatus: 'approved',
        isAvailable: true
      },
      attributes: ['color', 'images', 'pricePerTrip'],
      group: ['color', 'images', 'pricePerTrip'],
      raw: true
    });

    const colors = cars.map(car => ({
      color: car.color,
      image: car.images?.[0] || null,
      price: car.pricePerTrip
    }));

    res.json({ 
      success: true, 
      count: colors.length, 
      data: colors 
    });
  } catch (error) {
    console.error('Get colors error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Get pending car approvals (Admin only)
router.get('/admin/pending', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const pendingCars = await Car.findAll({
      where: { approvalStatus: 'pending' },
      include: [
        { 
          model: Branch, 
          as: 'branch',
          attributes: ['id', 'name', 'location', 'city']
        },
        { 
          model: Owner, 
          as: 'owner',
          attributes: ['id', 'businessName', 'panNumber', 'approvalStatus'],
          include: [
            { 
              model: User, 
              as: 'user',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
            }
          ]
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    res.json({ 
      success: true, 
      count: pendingCars.length, 
      data: pendingCars 
    });
  } catch (error) {
    console.error('Get pending cars error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Get cars statistics (Admin only)
router.get('/admin/stats/summary', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const stats = {
      totalCars: await Car.count(),
      approvedCars: await Car.count({ where: { approvalStatus: 'approved' } }),
      pendingCars: await Car.count({ where: { approvalStatus: 'pending' } }),
      rejectedCars: await Car.count({ where: { approvalStatus: 'rejected' } }),
      availableCars: await Car.count({ where: { isAvailable: true } }),
      unavailableCars: await Car.count({ where: { isAvailable: false } })
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Get owner's cars (Owner only)
router.get('/owner/my-cars', protect, async (req, res) => {
  try {
    // Find owner profile by user ID
    const owner = await Owner.findOne({ 
      where: { userId: req.user.id }
    });

    if (!owner) {
      return res.status(404).json({ 
        success: false, 
        message: 'Owner profile not found' 
      });
    }

    const cars = await Car.findAll({
      where: { ownerId: owner.id },
      include: [
        { 
          model: Branch, 
          as: 'branch',
          attributes: ['id', 'name', 'location', 'city']
        },
        { 
          model: Owner, 
          as: 'owner',
          attributes: ['id', 'businessName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ 
      success: true, 
      count: cars.length, 
      data: cars 
    });
  } catch (error) {
    console.error('Get owner cars error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Debug endpoint - Owner status
router.get('/debug/owner-status', protect, async (req, res) => {
  try {
    const owner = await Owner.findOne({ 
      where: { userId: req.user.id },
      attributes: ['id', 'userId', 'businessName', 'approvalStatus', 'isActive']
    });

    res.json({ 
      success: true, 
      data: { 
        userId: req.user.id,
        userRole: req.user.role,
        owner: owner || null
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ CREATE CAR (Owner only) - FIXED
router.post('/', protect, carValidationRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    console.log('🔍 Looking for owner with userId:', req.user.id, 'type:', typeof req.user.id);
    console.log('👤 User info:', { id: req.user.id, email: req.user.email, role: req.user.role });

    // ✅ Get the owner for this user (outside transaction to avoid issues)
    const owner = await Owner.findOne({
      where: { userId: req.user.id }
    });

    // If the above fails, try with raw SQL to debug
    if (!owner) {
      try {
        // First check what columns exist in the owners table
        const columns = await sequelize.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'owners' AND table_schema = 'public'",
          { type: sequelize.QueryTypes.SELECT }
        );
        console.log('👤 Owners table columns:', columns.map(c => c.column_name));

        // Try different column name variations
        const columnNames = ['user_id', 'userId', 'userid'];
        for (const colName of columnNames) {
          try {
            const rawOwner = await sequelize.query(
              `SELECT * FROM owners WHERE ${colName} = $1`,
              {
                bind: [req.user.id],
                type: sequelize.QueryTypes.SELECT
              }
            );
            console.log(`👤 Raw SQL with ${colName}:`, rawOwner);
            if (rawOwner.length > 0) {
              console.log(`👤 Found owner with column ${colName}, Sequelize mapping issue`);
              break;
            }
          } catch (colError) {
            console.log(`👤 Column ${colName} query failed:`, colError.message);
          }
        }
      } catch (rawError) {
        console.error('👤 Column inspection failed:', rawError);
      }
    }

    console.log('👤 Owner lookup result:', owner);
    console.log('👤 Owner lookup result type:', typeof owner);
    if (owner) {
      console.log('👤 Owner data:', JSON.stringify(owner.toJSON(), null, 2));
    }

    if (!owner) {
      return res.status(403).json({
        success: false,
        message: 'You are not registered as an owner. Please register first at /api/owners/register'
      });
    }

    if (!owner.id) {
      console.error('❌ Owner found but id is null/undefined:', owner);
      return res.status(500).json({
        success: false,
        message: 'Owner profile is corrupted. Please contact support.'
      });
    }

    console.log('👤 Owner found:', {
      id: owner.id,
      status: owner.approvalStatus,
      type: typeof owner.id
    });

    // ✅ Check owner approval status
    if (owner.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: `Your owner profile is currently "${owner.approvalStatus}". Only approved owners can create cars.`,
        currentStatus: owner.approvalStatus
      });
    }

    // ✅ Check if owner is active
    if (!owner.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your owner profile has been deactivated. Please contact support.'
      });
    }

    console.log('✅ Owner approved. Proceeding with car creation...');

    const transaction = await sequelize.transaction();

    try {
      // ✅ Verify branch exists
      const branch = await Branch.findByPk(req.body.branchId, { transaction });
      if (!branch) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }

      // ✅ Check for duplicate license plate
      const existingCar = await Car.findOne({
        where: { licensePlate: req.body.licensePlate },
        transaction
      });

      if (existingCar) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'License plate already exists'
        });
      }

      // ✅ Process arrays - handle different input formats
      let images = [];
      if (Array.isArray(req.body.images)) {
        images = req.body.images;
      } else if (typeof req.body.images === 'string' && req.body.images.trim()) {
        // Handle string that might be JSON or comma-separated
        try {
          // First try to parse as JSON
          const parsed = JSON.parse(req.body.images);
          images = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          // If not JSON, check if it's a malformed array string like ["url1","url2"]
          const trimmed = req.body.images.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              // Remove brackets and split by comma, then clean up quotes
              const content = trimmed.slice(1, -1); // Remove [ and ]
              if (content) {
                images = content.split(',').map(s => {
                  s = s.trim();
                  // Remove surrounding quotes if present
                  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                    s = s.slice(1, -1);
                  }
                  return s;
                }).filter(s => s); // Filter out empty strings
              }
            } catch (parseError) {
              // If malformed array parsing fails, try comma-separated
              images = req.body.images.split(',').map(s => s.trim()).filter(s => s);
            }
          } else {
            // Try comma-separated
            images = req.body.images.split(',').map(s => s.trim()).filter(s => s);
          }
        }
      }

      let features = [];
      if (Array.isArray(req.body.features)) {
        features = req.body.features;
      } else if (typeof req.body.features === 'string' && req.body.features.trim()) {
        try {
          const parsed = JSON.parse(req.body.features);
          features = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          // If not JSON, check if it's a malformed array string like ["feature1","feature2"]
          const trimmed = req.body.features.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              // Remove brackets and split by comma, then clean up quotes
              const content = trimmed.slice(1, -1); // Remove [ and ]
              if (content) {
                features = content.split(',').map(s => {
                  s = s.trim();
                  // Remove surrounding quotes if present
                  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                    s = s.slice(1, -1);
                  }
                  return s;
                }).filter(s => s); // Filter out empty strings
              }
            } catch (parseError) {
              // If malformed array parsing fails, try comma-separated
              features = req.body.features.split(',').map(s => s.trim()).filter(s => s);
            }
          } else {
            // Try comma-separated
            features = req.body.features.split(',').map(s => s.trim()).filter(s => s);
          }
        }
      }

      // ✅ CRITICAL FIX: Ensure ownerId is set correctly and parsed as integer
      // 🔒 SAFETY CHECK: Ensure licensePlate is valid before proceeding
      const licensePlateValue = (req.body.licensePlate || '').trim();
      console.log('🚗 License plate received:', {
        raw: req.body.licensePlate,
        type: typeof req.body.licensePlate,
        trimmed: licensePlateValue,
        length: licensePlateValue.length
      });

      if (!licensePlateValue) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'License plate cannot be empty or null',
          received: req.body.licensePlate
        });
      }

      const carData = {
        branchId: parseInt(req.body.branchId),
        ownerId: parseInt(owner.id),  // Ensure it's an integer
        make: req.body.make,
        model: req.body.model,
        year: parseInt(req.body.year),
        category: req.body.category,
        transmission: req.body.transmission,
        fuelType: req.body.fuelType,
        seatingCapacity: parseInt(req.body.seatingCapacity),
        pricePerTrip: parseFloat(req.body.pricePerTrip),
        licensePlate: licensePlateValue.toUpperCase(),
        color: req.body.color,
        images: images.length > 0 ? images : null,
        features: features.length > 0 ? features : null,
        mileage: parseInt(req.body.mileage) || 0,
        licenseDocument: req.body.licenseDocument,
        ownerPanNumber: req.body.ownerPanNumber,
        ownerBankAccount: req.body.ownerBankAccount,
        ownerIfscCode: req.body.ownerIfscCode,
        ownerBankName: req.body.ownerBankName,
        ownerUpiId: req.body.ownerUpiId,
        approvalStatus: 'pending',
        status: 'available',
        isAvailable: true,
        rating: 0,
        totalRatings: 0,
        ratingSum: 0
      };

      console.log('📝 Creating car with data:', {
        ...carData,
        images: carData.images,
        features: carData.features,
        ownerId: carData.ownerId,
        ownerIdType: typeof carData.ownerId,
        licensePlate: carData.licensePlate
      });

      const car = await Car.create(carData, { transaction });

      await transaction.commit();

      console.log('✅ Car created successfully:', {
        carId: car.id,
        ownerId: car.ownerId
      });

      res.status(201).json({
        success: true,
        message: 'Car created successfully and submitted for admin approval',
        data: car
      });

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Create car error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error creating car'
      });
    }

  } catch (error) {
    console.error('❌ Owner lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding owner profile'
    });
  }
});

// ============ GENERIC ROUTES (AFTER SPECIFIC ROUTES) ============

// ✅ Get all cars (Public) - with filters
router.get('/', async (req, res) => {
  try {
    const { make, model, category, fuelType, transmission, minPrice, maxPrice, page = 1, limit = 10 } = req.query;
    
    const where = { approvalStatus: 'approved', isAvailable: true };
    
    if (make) where.make = make;
    if (model) where.model = model;
    if (category) where.category = category;
    if (fuelType) where.fuelType = fuelType;
    if (transmission) where.transmission = transmission;
    if (minPrice || maxPrice) {
      where.pricePerTrip = {};
      if (minPrice) where.pricePerTrip[Op.gte] = minPrice;
      if (maxPrice) where.pricePerTrip[Op.lte] = maxPrice;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Car.findAndCountAll({
      where,
      include: [
        { 
          model: Branch, 
          as: 'branch',
          attributes: ['id', 'name','city']
        },
        { 
          model: Owner, 
          as: 'owner',
          attributes: ['id', 'businessName']
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      count: rows.length,
      total: count,
      pages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      data: rows
    });
  } catch (error) {
    console.error('Get all cars error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/admin/approve/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    // ✅ Validate input
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected"'
      });
    }

    // ✅ Find car
    const car = await Car.findByPk(id);

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found'
      });
    }

    // ✅ Prevent re-processing
    if (car.approvalStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Car already ${car.approvalStatus}`
      });
    }

    // ✅ Update status
    car.approvalStatus = status;

    // Optional: If rejected → make unavailable
    if (status === 'rejected') {
      car.isAvailable = false;
    }

    await car.save();

    return res.json({
      success: true,
      message: `Car ${status} successfully`,
      data: car
    });

  } catch (error) {
    console.error('Approve car error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ✅ Get single car by ID
router.get('/:id', async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id, {
      include: [
        { 
          model: Branch, 
          as: 'branch'
        },
        { 
          model: Owner, 
          as: 'owner',
          include: [
            { 
              model: User, 
              as: 'user',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
            }
          ]
        }
      ]
    });

    if (!car) {
      return res.status(404).json({ 
        success: false, 
        message: 'Car not found' 
      });
    }

    res.json({ success: true, data: car });
  } catch (error) {
    console.error('Get car error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;