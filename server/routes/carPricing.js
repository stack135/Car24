const express = require('express');
const router = express.Router();
const { CarPricing, Car, Owner } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { carPricingValidation, validate } = require('../middleware/validation');

// Set pricing for a car (Admin only)
router.post('/', protect, authorize('admin', 'super_admin'), carPricingValidation, validate, async (req, res) => {
  try {
    const { carId, duration, price } = req.body;

    // Check if car exists
    const car = await Car.findByPk(carId);
    if (!car) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }

    // Check if pricing already exists for this car and duration
    const existingPricing = await CarPricing.findOne({ where: { carId, duration } });
    if (existingPricing) {
      return res.status(400).json({ success: false, message: `Pricing for ${duration} hours already exists for this car` });
    }

    const pricing = await CarPricing.create({
      carId,
      duration,
      price,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Car pricing set successfully',
      data: pricing
    });
  } catch (error) {
    console.error('Set car pricing error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get pricing for a specific car
router.get('/car/:carId', async (req, res) => {
  try {
    const pricing = await CarPricing.findAll({
      where: { carId: req.params.carId, isActive: true },
      include: [{ model: Car, as: 'car' }],
      order: [['duration', 'ASC']]
    });

    res.json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all car pricing (Admin only)
router.get('/', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const pricing = await CarPricing.findAll({
      include: [
        { 
          model: Car, 
          as: 'car',
          include: [{ model: Owner, as: 'owner' }]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update car pricing (Admin only)
router.put('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { price, isActive } = req.body;

    const pricing = await CarPricing.findByPk(req.params.id);
    if (!pricing) {
      return res.status(404).json({ success: false, message: 'Pricing not found' });
    }

    await pricing.update({
      price: price !== undefined ? price : pricing.price,
      isActive: isActive !== undefined ? isActive : pricing.isActive
    });

    res.json({
      success: true,
      message: 'Car pricing updated successfully',
      data: pricing
    });
  } catch (error) {
    console.error('Update car pricing error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete car pricing (Admin only)
router.delete('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const pricing = await CarPricing.findByPk(req.params.id);
    if (!pricing) {
      return res.status(404).json({ success: false, message: 'Pricing not found' });
    }

    await pricing.destroy();

    res.json({
      success: true,
      message: 'Car pricing deleted successfully'
    });
  } catch (error) {
    console.error('Delete car pricing error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bulk set pricing for multiple cars (Admin only)
router.post('/bulk', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { carIds, pricingData } = req.body;

    if (!Array.isArray(carIds) || !Array.isArray(pricingData)) {
      return res.status(400).json({ success: false, message: 'carIds and pricingData must be arrays' });
    }

    const results = [];
    const errors = [];

    for (const carId of carIds) {
      for (const pricing of pricingData) {
        try {
          const { duration, price } = pricing;

          // Check if pricing already exists
          const existingPricing = await CarPricing.findOne({ where: { carId, duration } });
          if (existingPricing) {
            await existingPricing.update({ price });
            results.push({ carId, duration, price, action: 'updated' });
          } else {
            await CarPricing.create({ carId, duration, price, isActive: true });
            results.push({ carId, duration, price, action: 'created' });
          }
        } catch (error) {
          errors.push({ carId, error: error.message });
        }
      }
    }

    res.json({
      success: true,
      message: 'Bulk pricing operation completed',
      results,
      errors
    });
  } catch (error) {
    console.error('Bulk set pricing error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get pricing statistics (Admin only)
router.get('/stats', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const totalPricingRecords = await CarPricing.count();
    const activePricingRecords = await CarPricing.count({ where: { isActive: true } });
    
    const pricingByDuration = await CarPricing.findAll({
      attributes: [
        'duration',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('price')), 'avgPrice'],
        [sequelize.fn('MIN', sequelize.col('price')), 'minPrice'],
        [sequelize.fn('MAX', sequelize.col('price')), 'maxPrice']
      ],
      where: { isActive: true },
      group: ['duration'],
      order: [['duration', 'ASC']]
    });

    const stats = {
      totalPricingRecords,
      activePricingRecords,
      inactivePricingRecords: totalPricingRecords - activePricingRecords,
      pricingByDuration
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;