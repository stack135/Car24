const express = require('express');
const router = express.Router();
const Car = require('../models/Car');
const { protect, authorize } = require('../middleware/auth');

// Get all cars with filters
router.get('/', async (req, res) => {
  try {
    const { category, minPrice, maxPrice, transmission, location } = req.query;
    
    let query = { isAvailable: true };
    
    if (category) query.category = category;
    if (transmission) query.transmission = transmission;
    if (minPrice || maxPrice) {
      query.pricePerDay = {};
      if (minPrice) query.pricePerDay.$gte = Number(minPrice);
      if (maxPrice) query.pricePerDay.$lte = Number(maxPrice);
    }

    const cars = await Car.find(query).populate('branchId');
    res.json({ success: true, count: cars.length, data: cars });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single car
router.get('/:id', async (req, res) => {
  try {
    const car = await Car.findById(req.params.id).populate('branchId');
    if (!car) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }
    res.json({ success: true, data: car });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create car (Branch Head, Admin, Super Admin)
router.post('/', protect, authorize('branch_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const car = await Car.create(req.body);
    res.status(201).json({ success: true, data: car });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update car
router.put('/:id', protect, authorize('branch_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const car = await Car.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!car) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }
    res.json({ success: true, data: car });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete car
router.delete('/:id', protect, authorize('branch_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const car = await Car.findByIdAndDelete(req.params.id);
    if (!car) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }
    res.json({ success: true, message: 'Car deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
