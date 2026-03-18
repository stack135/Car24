'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add licensePlate column if it doesn't exist
    try {
      await queryInterface.addColumn('cars', 'licensePlate', {
        type: Sequelize.STRING(20),
        allowNull: true
      });
      console.log('✅ Added licensePlate column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ licensePlate column already exists, skipping');
      } else {
        throw error;
      }
    }

    // 2. Migrate data: prioritize license_plate, then license_number, then generate TEMP
    await queryInterface.sequelize.query(`
      UPDATE cars 
      SET "licensePlate" = TRIM(COALESCE(
        "license_plate", 
        "license_number", 
        'TEMP-' || id::text
      ))
      WHERE "licensePlate" IS NULL OR TRIM("licensePlate") = ''
    `);

    console.log('✅ Migrated data to licensePlate column');

    // 3. Drop duplicate columns
    try {
      await queryInterface.removeColumn('cars', 'license_plate');
      console.log('✅ Dropped license_plate column');
    } catch (error) {
      console.log('ℹ️ license_plate column already dropped');
    }

    try {
      await queryInterface.removeColumn('cars', 'license_number');
      console.log('✅ Dropped license_number column');
    } catch (error) {
      console.log('ℹ️ license_number column already dropped');
    }

    // 4. Make licensePlate NOT NULL and UNIQUE
    await queryInterface.changeColumn('cars', 'licensePlate', {
      type: Sequelize.STRING(20),
      allowNull: false,
      unique: true
    });

    console.log('✅ licensePlate column finalized (NOT NULL + UNIQUE)');
  },

  async down(queryInterface, Sequelize) {
    // Restore duplicate columns for rollback
    await queryInterface.addColumn('cars', 'license_plate', {
      type: Sequelize.STRING(20),
      allowNull: true
    });

    await queryInterface.addColumn('cars', 'license_number', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Copy data back (best effort)
    await queryInterface.sequelize.query(`
      UPDATE cars 
      SET "license_plate" = "licensePlate",
          "license_number" = "licensePlate"
    `);

    // Revert licensePlate
    await queryInterface.changeColumn('cars', 'licensePlate', {
      type: Sequelize.STRING(20),
      allowNull: true,
      unique: false
    });
  }
};

