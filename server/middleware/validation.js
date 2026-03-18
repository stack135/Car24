const { body, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Booking validation rules
const bookingValidation = [
  body('carId').isInt().withMessage('Car ID must be a valid integer'),
  body('pickupDate').custom((value) => {
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
      /^\d{2}\/\d{2}\/\d{4}$/  // MM/DD/YYYY
    ];
    return formats.some(format => format.test(value)) || 'Pickup date must be in YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY format';
  }).withMessage('Pickup date must be in YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY format'),
  body('pickupTime').custom((value) => {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    return timeRegex.test(value) || 'Invalid time value';
  }).withMessage('Invalid time value'),
  body('dropoffDate').custom((value) => {
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
      /^\d{2}\/\d{2}\/\d{4}$/  // MM/DD/YYYY
    ];
    return formats.some(format => format.test(value)) || 'Dropoff date must be in YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY format';
  }).withMessage('Dropoff date must be in YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY format'),
  body('dropoffTime').custom((value) => {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    return timeRegex.test(value) || 'Invalid time value';
  }).withMessage('Invalid time value'),
  body('duration').isIn([6, 12, 24]).withMessage('Duration must be 6, 12, or 24 hours'),
  body('pickupLocation').notEmpty().withMessage('Pickup location is required'),
  body('dropoffLocation').notEmpty().withMessage('Dropoff location is required')
];

// Payment validation rules
const paymentValidation = [
  body('bookingId').isInt().withMessage('Booking ID must be a valid integer'),
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('paymentMethod').notEmpty().withMessage('Payment method is required')
];

// Owner registration validation
const ownerValidation = [
  body('businessName').notEmpty().withMessage('Business name is required'),
  body('businessLicense').notEmpty().withMessage('Business license is required'),
  body('panNumber').matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN number format'),
  body('bankAccountNumber').isLength({ min: 9, max: 18 }).withMessage('Invalid bank account number'),
  body('ifscCode').matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC code format'),
  body('upiId').isEmail().withMessage('UPI ID must be a valid email format')
];

// Car pricing validation for single object
const carPricingValidation = [
  body('carId').isInt().withMessage('Car ID must be a valid integer'),
  body('duration').isIn([6, 12, 24]).withMessage('Duration must be 6, 12, or 24 hours'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number')
];

// Car pricing validation for array
const carPricingArrayValidation = [
  body('*.carId').isInt().withMessage('Car ID must be a valid integer'),
  body('*.duration').isIn([6, 12, 24]).withMessage('Duration must be 6, 12, or 24 hours'),
  body('*.price').isFloat({ min: 0 }).withMessage('Price must be a positive number')
];

// Branch validation for single object
const branchValidation = [
  body('name').notEmpty().withMessage('Branch name is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('zipCode').notEmpty().withMessage('Zip code is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('email').isEmail().withMessage('Valid email is required')
];

// Branch validation for array
const branchArrayValidation = [
  body('*.name').notEmpty().withMessage('Branch name is required'),
  body('*.address').notEmpty().withMessage('Address is required'),
  body('*.city').notEmpty().withMessage('City is required'),
  body('*.state').notEmpty().withMessage('State is required'),
  body('*.zipCode').notEmpty().withMessage('Zip code is required'),
  body('*.phone').notEmpty().withMessage('Phone number is required'),
  body('*.email').isEmail().withMessage('Valid email is required')
];

module.exports = {
  validate,
  bookingValidation,
  paymentValidation,
  ownerValidation,
  carPricingValidation,
  branchValidation,
  branchArrayValidation
};
