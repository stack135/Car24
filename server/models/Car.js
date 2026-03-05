const mongoose = require('mongoose');

const carSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  make: {
    type: String,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    enum: ['economy', 'suv', 'luxury', 'van'],
    required: true
  },
  transmission: {
    type: String,
    enum: ['automatic', 'manual'],
    required: true
  },
  fuelType: {
    type: String,
    required: true
  },
  seatingCapacity: {
    type: Number,
    required: true
  },
  pricePerDay: {
    type: Number,
    required: true
  },
  images: [String],
  features: [String],
  isAvailable: {
    type: Boolean,
    default: true
  },
  licensePlate: {
    type: String,
    required: true,
    unique: true
  },
  mileage: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Car', carSchema);
