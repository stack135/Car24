'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, check and add all missing columns
    const columns = [
      { 
        name: 'pricePerTrip', 
        type: Sequelize.DECIMAL(10, 2),
        options: { allowNull: true, defaultValue: 1000 }
      },
      { 
        name: 'is_available', 
        type: Sequelize.BOOLEAN,
        options: { defaultValue: true }
      },
      { 
        name: 'color', 
        type: Sequelize.STRING(50),
        options: { defaultValue: 'Not specified' }
      },
      { 
        name: 'rating', 
        type: Sequelize.DECIMAL(3, 2),
        options: { defaultValue: 0.00 }
      },
      { 
        name: 'total_ratings', 
        type: Sequelize.INTEGER,
        options: { defaultValue: 0 }
      },
      { 
        name: 'rating_sum', 
        type: Sequelize.DECIMAL(10, 2),
        options: { defaultValue: 0.00 }
      },
      { 
        name: 'license_number', 
        type: Sequelize.STRING,
        options: { allowNull: true, defaultValue: 'PENDING' }
      },
      { 
        name: 'license_document', 
        type: Sequelize.STRING,
        options: { allowNull: true, defaultValue: 'https://example.com/license' }
      },
      { 
        name: 'owner_pan_number', 
        type: Sequelize.STRING,
        options: { allowNull: true, defaultValue: 'AAAAA0000A' }
      },
      { 
        name: 'owner_bank_account', 
        type: Sequelize.STRING,
        options: { allowNull: true, defaultValue: '0000000000' }
      },
      { 
        name: 'owner_ifsc_code', 
        type: Sequelize.STRING,
        options: { allowNull: true, defaultValue: 'SBIN0000001' }
      },
      { 
        name: 'owner_bank_name', 
        type: Sequelize.STRING,
        options: { allowNull: true, defaultValue: 'Bank' }
      },
      { 
        name: 'owner_upi_id', 
        type: Sequelize.STRING,
        options: { allowNull: true, defaultValue: 'user@upi' }
      },
      { 
        name: 'approval_status', 
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        options: { defaultValue: 'pending' }
      },
      { 
        name: 'rejection_reason', 
        type: Sequelize.TEXT,
        options: { allowNull: true }
      },
      { 
        name: 'current_location', 
        type: Sequelize.STRING(200),
        options: { allowNull: true }
      },
      { 
        name: 'status', 
        type: Sequelize.ENUM('available', 'rented', 'maintenance', 'reserved'),
        options: { defaultValue: 'available' }
      },
      { 
        name: 'insurance_expiry_date', 
        type: Sequelize.DATEONLY,
        options: { allowNull: true }
      },
      { 
        name: 'last_maintenance_date', 
        type: Sequelize.DATEONLY,
        options: { allowNull: true }
      },
      { 
        name: 'next_maintenance_date', 
        type: Sequelize.DATEONLY,
        options: { allowNull: true }
      },
      { 
        name: 'created_by', 
        type: Sequelize.UUID,
        options: { allowNull: true }
      },
      { 
        name: 'updated_by', 
        type: Sequelize.UUID,
        options: { allowNull: true }
      },
      { 
        name: 'fuel_type', 
        type: Sequelize.STRING(30),
        options: { allowNull: true, defaultValue: 'petrol' }
      },
      { 
        name: 'transmission', 
        type: Sequelize.ENUM('automatic', 'manual'),
        options: { defaultValue: 'automatic' }
      },
      { 
        name: 'seating_capacity', 
        type: Sequelize.INTEGER,
        options: { defaultValue: 5 }
      },
      { 
        name: 'mileage', 
        type: Sequelize.INTEGER,
        options: { defaultValue: 0 }
      },
      { 
        name: 'make', 
        type: Sequelize.STRING(50),
        options: { allowNull: true, defaultValue: 'Unknown' }
      },
      { 
        name: 'model', 
        type: Sequelize.STRING(50),
        options: { allowNull: true, defaultValue: 'Unknown' }
      },
      { 
        name: 'year', 
        type: Sequelize.INTEGER,
        options: { allowNull: true, defaultValue: new Date().getFullYear() }
      },
      { 
        name: 'category', 
        type: Sequelize.STRING(50),
        options: { allowNull: true, defaultValue: 'Standard' }
      },
      { 
        name: 'created_at', 
        type: Sequelize.DATE,
        options: { defaultValue: Sequelize.NOW }
      },
      { 
        name: 'updated_at', 
        type: Sequelize.DATE,
        options: { defaultValue: Sequelize.NOW }
      }
    ];

    // Add each column if it doesn't exist
    for (const column of columns) {
      try {
        await queryInterface.addColumn('cars', column.name, {
          type: column.type,
          ...column.options
        });
        console.log(`Added column ${column.name}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`Column ${column.name} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    // Generate unique license plates for existing rows
    const cars = await queryInterface.sequelize.query(
      'SELECT id FROM cars WHERE license_plate IS NULL OR license_plate = \'\'',
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (let i = 0; i < cars.length; i++) {
      await queryInterface.sequelize.query(
        `UPDATE cars SET license_plate = 'TEMP-' || id::text WHERE id = :id`,
        { replacements: { id: cars[i].id } }
      );
    }

    // Now make license_plate non-nullable and unique
    await queryInterface.changeColumn('cars', 'license_plate', {
      type: Sequelize.STRING(20),
      allowNull: true,
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    const columns = [
      'license_plate', 'branch_id', 'owner_id', 'price_per_trip', 'is_available',
      'color', 'rating', 'total_ratings', 'rating_sum', 'license_number',
      'license_document', 'owner_pan_number', 'owner_bank_account', 'owner_ifsc_code',
      'owner_bank_name', 'owner_upi_id', 'approval_status', 'rejection_reason',
      'current_location', 'status', 'insurance_expiry_date', 'last_maintenance_date',
      'next_maintenance_date', 'created_by', 'updated_by', 'created_at', 'updated_at',
      'fuel_type', 'transmission', 'seating_capacity', 'mileage', 'make', 'model', 'year', 'category'
    ];

    for (const column of columns) {
      try {
        await queryInterface.removeColumn('cars', column);
      } catch (error) {
        console.log(`Column ${column} does not exist, skipping`);
      }
    }
  }
};