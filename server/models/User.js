const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: {
        msg: 'Email is required'
      },
      isEmail: {
        msg: 'Must be a valid email address'
      }
    },
    set(value) {
      this.setDataValue('email', value.toLowerCase().trim());
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Password is required'
      },
      len: {
        args: [6, 100],
        msg: 'Password must be at least 6 characters long'
      }
    }
  },
  firstName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'First name is required'
      },
      len: {
        args: [2, 50],
        msg: 'First name must be between 2 and 50 characters'
      }
    },
    field: 'first_name',
    set(value) {
      this.setDataValue('firstName', value.trim());
    }
  },
  lastName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Last name is required'
      },
      len: {
        args: [2, 50],
        msg: 'Last name must be between 2 and 50 characters'
      }
    },
    field: 'last_name',
    set(value) {
      this.setDataValue('lastName', value.trim());
    }
  },
  phone: {
    type: DataTypes.STRING(15),
    validate: {
      is: {
        args: /^[0-9+\-\s()]{10,15}$/,
        msg: 'Please enter a valid phone number'
      }
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'staff', 'branch_head', 'admin', 'super_admin'),
    defaultValue: 'user',
    validate: {
      isIn: {
        args: [['user', 'staff', 'branch_head', 'admin', 'super_admin']],
        msg: 'Invalid role specified'
      }
    }
  },
  branchId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Branches',
      key: 'id'
    },
    field: 'branch_id'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  lastLogin: {
    type: DataTypes.DATE,
    field: 'last_login'
  },
  passwordChangedAt: {
    type: DataTypes.DATE,
    field: 'password_changed_at'
  },
  passwordResetToken: {
    type: DataTypes.STRING,
    field: 'password_reset_token'
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    field: 'password_reset_expires'
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'email_verified'
  },
  emailVerificationToken: {
    type: DataTypes.STRING,
    field: 'email_verification_token'
  },
  createdBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id'
    },
    field: 'created_by'
  },
  updatedBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id'
    },
    field: 'updated_by'
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'users',
  
  // Hooks for password hashing
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
        user.passwordChangedAt = new Date();
      }
    }
  },
  
  // Default scope to exclude sensitive data
  defaultScope: {
    attributes: { exclude: ['password', 'passwordResetToken', 'emailVerificationToken'] }
  },
  
  // Custom scopes
  scopes: {
    withPassword: {
      attributes: { include: ['password'] }
    },
    active: {
      where: { isActive: true }
    },
    byRole: (role) => {
      return {
        where: { role }
      };
    }
  },
  
  // Indexes
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['role']
    },
    {
      fields: ['branch_id']
    },
    {
      fields: ['is_active']
    }
  ]
});

// Instance method to compare password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if password was changed after token issued
User.prototype.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to create password reset token
User.prototype.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Static method to find by email with password
User.findByEmailWithPassword = async function(email) {
  return await this.scope('withPassword').findOne({ where: { email: email.toLowerCase().trim() } });
};

module.exports = User;