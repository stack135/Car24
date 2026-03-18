// models/Car.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Car = sequelize.define('Car', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  branchId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'branchId',  // Map to snake_case in DB
    references: {
      model: 'branches',
      key: 'id'
    }
  },
  ownerId: {
    type: DataTypes.INTEGER,  // Make sure this is INTEGER
    allowNull: false,
    field: 'ownerId',  // Map to camelCase in DB
    references: {
      model: 'owners',
      key: 'id'
    }
  },
  make: {
    type: DataTypes.STRING,
    allowNull: false
  },
  model: {
    type: DataTypes.STRING,
    allowNull: false
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  transmission: {
    type: DataTypes.ENUM('automatic', 'manual'),
    allowNull: false
  },
  fuelType: {
    type: DataTypes.ENUM('petrol', 'diesel', 'electric', 'hybrid', 'cng'),
    allowNull: false,
    field: 'fuelType'
  },
  seatingCapacity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'seatingCapacity'
  },
  pricePerTrip: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'price_per_trip'  // FIXED: Use snake_case
  },
  licensePlate: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'licensePlate'
  },
  color: {
    type: DataTypes.STRING,
    allowNull: false
  },
  images: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
    get() {
      const value = this.getDataValue('images');
      return value || [];
    }
  },
  features: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
    get() {
      const value = this.getDataValue('features');
      return value || [];
    }
  },
  mileage: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  licenseDocument: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'licenseDocument'
  },
  ownerPanNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'ownerPanNumber'
  },
  ownerBankAccount: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'ownerBankAccount'
  },
  ownerIfscCode: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'ownerIfscCode'
  },
  ownerBankName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'ownerBankName'
  },
  ownerUpiId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'ownerUpiId'
  },
  approvalStatus: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
    field: 'approvalStatus'
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'available'
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'isAvailable'
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0
  },
  totalRatings: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_ratings'
  },
  ratingSum: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'rating_sum'
  }
}, {
  tableName: 'cars',
  timestamps: true,
  underscored: false,  // Use camelCase column names
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

module.exports = Car;