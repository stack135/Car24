const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  carId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Cars',
      key: 'id'
    }
  },
  branchId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Branches',
      key: 'id'
    }
  },
  pickupDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  dropoffDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  pickupTime: {
    type: DataTypes.STRING(8),
    allowNull: false
  },
  dropoffTime: {
    type: DataTypes.STRING(8),
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 6,
      max: 24
    }
  },
  pickupLocation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dropoffLocation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'active', 'completed', 'cancelled'),
    defaultValue: 'pending'
  },
  paymentId: {
    type: DataTypes.UUID,
    references: {
      model: 'Payments',
      key: 'id'
    }
  },
  extras: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  confirmationNumber: {
    type: DataTypes.STRING,
    unique: true
  },
  createdBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  updatedBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  timestamps: true
});

module.exports = Booking;