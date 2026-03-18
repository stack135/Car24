const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

// Define models
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 255]
    }
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('user', 'owner', 'staff', 'branch_head', 'admin', 'super_admin'),
    defaultValue: 'user'
  },
  branchId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Replace the Owner definition

const Owner = sequelize.define('Owner', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'userId',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  businessName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  businessLicense: {
    type: DataTypes.STRING,
    allowNull: false
  },
  panNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  gstNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bankAccountNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ifscCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  upiId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  approvalStatus: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'owners',
  timestamps: true,
  underscored: false
});

const Branch = sequelize.define('Branch', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false
  },
  zipCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  branchHeadId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'branches',
  timestamps: true
});

const Car = require('./Car');

const CarPricing = sequelize.define('CarPricing', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  carId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Duration in hours: 6, 12, or 24'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'car_pricing',
  timestamps: true
});

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  carId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  branchId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  pickupDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  pickupTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  dropoffDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  dropoffTime: {
    type: DataTypes.TIME,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Duration in hours: 6, 12, or 24'
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
  advanceAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  remainingAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('awaiting_payment', 'confirmed', 'active', 'completed', 'cancelled'),
    defaultValue: 'awaiting_payment'
  },
  qrCode: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  upiLink: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  paymentExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  confirmationNumber: {
    type: DataTypes.STRING,
    unique: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'bookings',
  timestamps: true
});

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  transactionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: false
  },
  paymentType: {
    type: DataTypes.ENUM('advance', 'remaining', 'full'),
    defaultValue: 'advance'
  },
  paymentScreenshot: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
    defaultValue: 'pending'
  },
  paymentDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'payments',
  timestamps: true
});

const Refund = sequelize.define('Refund', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  paymentId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  refundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  refundReason: {
    type: DataTypes.STRING,
    allowNull: false
  },
  refundStatus: {
    type: DataTypes.ENUM('pending', 'processed', 'failed'),
    defaultValue: 'pending'
  },
  refundTransactionId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'refunds',
  timestamps: true
});

const Ride = sequelize.define('Ride', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bookingId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  rideStartTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rideEndTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  actualReturnTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  latePenalty: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  rideStatus: {
    type: DataTypes.ENUM('pending', 'active', 'completed', 'cancelled'),
    defaultValue: 'pending'
  }
}, {
  tableName: 'rides',
  timestamps: true
});

// Define associations
User.hasOne(Owner, { foreignKey: 'userId', as: 'ownerProfile' });
Owner.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Owner.hasMany(Car, { foreignKey: 'ownerId', as: 'cars' });
Car.belongsTo(Owner, { foreignKey: 'ownerId', as: 'owner' });

Branch.hasMany(Car, { foreignKey: 'branchId', as: 'cars' });
Car.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Car.hasMany(CarPricing, { foreignKey: 'carId', as: 'pricing' });
CarPricing.belongsTo(Car, { foreignKey: 'carId', as: 'car' });

User.hasMany(Booking, { foreignKey: 'userId', as: 'bookings' });
Booking.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Car.hasMany(Booking, { foreignKey: 'carId', as: 'bookings' });
Booking.belongsTo(Car, { foreignKey: 'carId', as: 'car' });

Branch.hasMany(Booking, { foreignKey: 'branchId', as: 'bookings' });
Booking.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Booking.hasMany(Payment, { foreignKey: 'bookingId', as: 'payments' });
Payment.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });

User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Booking.hasOne(Ride, { foreignKey: 'bookingId', as: 'ride' });
Ride.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });

Booking.hasMany(Refund, { foreignKey: 'bookingId', as: 'refunds' });
Refund.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });

Payment.hasMany(Refund, { foreignKey: 'paymentId', as: 'refunds' });
Refund.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

User.hasMany(Branch, { foreignKey: 'branchHeadId', as: 'headedBranches', constraints: false });
Branch.belongsTo(User, { foreignKey: 'branchHeadId', as: 'branchHead', constraints: false });

User.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', constraints: false });
Branch.hasMany(User, { foreignKey: 'branchId', as: 'staff', constraints: false });

module.exports = {
  sequelize,
  User,
  Owner,
  Branch,
  Car,
  CarPricing,
  Booking,
  Payment,
  Refund,
  Ride
};