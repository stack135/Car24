'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.removeConstraint('cars', 'cars_owner_id_fkey');
    } catch (error) {
      console.log('Constraint removal skipped');
    }

    // First, check the current type of owner_id
    const table = await queryInterface.describeTable('cars');
    console.log('owner_id column type:', table.owner_id?.type);

    // If it's already UUID, skip
    if (table.owner_id?.type === 'USER-DEFINED') {
      console.log('owner_id is already UUID, skipping conversion');
      return;
    }

    // Drop default if exists
    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE cars ALTER COLUMN owner_id DROP DEFAULT'
      );
    } catch (error) {
      console.log('Drop default skipped');
    }

    // Change column to allow NULL temporarily
    await queryInterface.sequelize.query(
      'ALTER TABLE cars ALTER COLUMN owner_id DROP NOT NULL'
    );

    // Get the max integer owner_id to map to owner UUIDs
    const owners = await queryInterface.sequelize.query(
      'SELECT id FROM owners ORDER BY id LIMIT 1'
    );

    if (owners[0].length === 0) {
      console.log('No owners found, setting owner_id to NULL');
      await queryInterface.sequelize.query(
        'UPDATE cars SET owner_id = NULL'
      );
    }

    // Now change type to UUID
    await queryInterface.sequelize.query(
      'ALTER TABLE cars ALTER COLUMN owner_id TYPE UUID USING CAST(owner_id AS TEXT)::uuid'
    );

    // Set NOT NULL again
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
    try {
      await queryInterface.removeConstraint('cars', 'cars_owner_id_fkey');
    } catch (error) {
      console.log('Constraint removal skipped');
    }
  }
};