'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Fix price_per_trip column: Remove wrong camelCase, add correct snake_case
     */

    // 1. Drop wrong column if exists (from previous buggy migration)
    try {
      await queryInterface.removeColumn('cars', 'pricePerTrip');
      console.log('✅ Dropped wrong pricePerTrip column');
    } catch (error) {
      console.log('ℹ️ pricePerTrip column didn\'t exist, continuing...');
    }

    // 2. Check if price_per_trip column already exists
    try {
      const columns = await queryInterface.describeTable('cars');
      if (columns.price_per_trip) {
        console.log('ℹ️ price_per_trip column already exists, skipping addition');
        return;
      }
    } catch (error) {
      console.log('Error checking columns:', error.message);
    }

    // 3. Add correct price_per_trip column (snake_case for underscored model) only if it doesn't exist
    try {
      await queryInterface.addColumn('cars', 'price_per_trip', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 25.00
      });
      console.log('✅ Added correct price_per_trip DECIMAL(10,2) NOT NULL DEFAULT 25.00');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ price_per_trip column already exists, continuing...');
      } else {
        throw error;
      }
    }
  },

  async down (queryInterface, Sequelize) {
    /**
     * Revert: Drop correct column, optionally restore wrong one
     */
    try {
      await queryInterface.removeColumn('cars', 'price_per_trip');
      console.log('🔄 Reverted: Dropped price_per_trip column');
    } catch (error) {
      console.log('ℹ️ price_per_trip column didn\'t exist during revert');
    }
  }
};
