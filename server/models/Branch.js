const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Branch = sequelize.define('Branch', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Branch name is required'
      }
    }
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Address is required'
      }
    }
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'City is required'
      }
    }
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'State is required'
      }
    }
  },
  zipCode: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Zip code is required'
      },
      is: /^[0-9]{5,6}$/  // Validates 5-6 digit zip code
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Phone number is required'
      },
      is: /^[0-9+\-\s()]{10,15}$/  // Basic phone validation
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Email is required'
      },
      isEmail: {
        msg: 'Must be a valid email address'
      }
    }
  },
  branchHeadId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    },
    field: 'branch_head_id'  // Column name in database
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'  // Column name in database
  }
}, {
  timestamps: true,
  underscored: true,  // Use snake_case for automatically added fields (created_at, updated_at)
  tableName: 'branches',  // Explicitly set table name
  
  // Add indexes for better query performance
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['city']
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = Branch;