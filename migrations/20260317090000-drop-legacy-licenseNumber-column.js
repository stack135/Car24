'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop legacy licenseNumber column (camelCase) if it exists
    try {
      await queryInterface.removeColumn('cars', 'licenseNumber');
      console.log('✅ Dropped legacy licenseNumber column');
    } catch (error) {
      if (error.message.includes('does not exist') || error.message.includes('already removed')) {
        console.log('ℹ️ licenseNumber column already dropped or does not exist, skipping');
      } else {
        throw error;
      }
    }

    console.log('✅ Completed licenseNumber cleanup migration');
  },

  async down(queryInterface, Sequelize) {
    // Restore licenseNumber column for rollback
    try {
      await queryInterface.addColumn('cars', 'licenseNumber', {
        type: Sequelize.STRING,
        allowNull: true
      });
      console.log('✅ Restored licenseNumber column for rollback');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ licenseNumber column already exists, skipping restore');
      } else {
        throw error;
      }
    }
  }
};
