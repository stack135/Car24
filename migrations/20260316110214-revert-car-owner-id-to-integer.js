'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.removeConstraint('cars', 'cars_owner_id_fkey');
    } catch (error) {
      console.log('Constraint removal skipped');
    }

    // First, handle NULL values - set them to a default owner ID (assuming owner ID 1 exists)
    await queryInterface.sequelize.query(`
      UPDATE cars SET owner_id = 1 WHERE owner_id IS NULL
    `);

    // Change column back to INTEGER
    await queryInterface.sequelize.query(
      'ALTER TABLE cars ALTER COLUMN owner_id TYPE INTEGER USING owner_id::integer'
    );

    // Set NOT NULL
    await queryInterface.sequelize.query(
      'ALTER TABLE cars ALTER COLUMN owner_id SET NOT NULL'
    );

    // Re-add the foreign key
    try {
      await queryInterface.addConstraint('cars', {
        fields: ['owner_id'],
        type: 'foreign key',
        name: 'cars_owner_id_fkey',
        references: {
          table: 'owners',
          field: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (error) {
      console.log('Foreign key creation skipped:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    // This reverts back to UUID
    try {
      await queryInterface.removeConstraint('cars', 'cars_owner_id_fkey');
    } catch (error) {
      console.log('Constraint removal skipped');
    }

    await queryInterface.sequelize.query(
      'ALTER TABLE cars ALTER COLUMN owner_id TYPE UUID USING CAST(owner_id AS TEXT)::uuid'
    );

    try {
      await queryInterface.addConstraint('cars', {
        fields: ['owner_id'],
        type: 'foreign key',
        name: 'cars_owner_id_fkey',
        references: {
          table: 'owners',
          field: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (error) {
      console.log('Foreign key creation skipped:', error.message);
    }
  }
};
