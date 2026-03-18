'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // First, update any existing NULL created_at values to current timestamp
    await queryInterface.sequelize.query(`
      UPDATE cars SET created_at = NOW() WHERE created_at IS NULL
    `);

    // Then, change the column to NOT NULL with default value
    await queryInterface.changeColumn('cars', 'created_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    });

    // Also ensure updated_at has proper constraints
    await queryInterface.sequelize.query(`
      UPDATE cars SET updated_at = NOW() WHERE updated_at IS NULL
    `);

    await queryInterface.changeColumn('cars', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    });
  },

  async down (queryInterface, Sequelize) {
    // Revert the changes - make columns nullable again
    await queryInterface.changeColumn('cars', 'created_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.changeColumn('cars', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
  }
};
