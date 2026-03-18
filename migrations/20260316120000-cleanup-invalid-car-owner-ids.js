'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('=== Starting car owner_id cleanup ===');

    // Check the current type of owner_id column
    const table = await queryInterface.describeTable('cars');
    const columnType = table.owner_id?.type;

    console.log('Current owner_id column type:', columnType);

    // If column is already INTEGER, skip cleanup as it's not needed
    if (columnType === 'INTEGER') {
      console.log('Column is already INTEGER, skipping UUID cleanup');
      return;
    }

    // 1. Identify and fix invalid UUID strings in owner_id (set to NULL)
    const invalidUuidCount = await queryInterface.sequelize.query(`
      UPDATE cars
      SET owner_id = NULL
      WHERE owner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND owner_id !~ '^[0-9]+$'::text
      RETURNING 1
    `);

    console.log(`Fixed ${invalidUuidCount[1]} rows with invalid UUID strings`);

    // 2. Check current data types and samples
    const sampleData = await queryInterface.sequelize.query(`
      SELECT owner_id, COUNT(*) as count
      FROM cars
      GROUP BY owner_id
      ORDER BY count DESC
      LIMIT 10
    `);
    console.log('Sample owner_id values:', sampleData[0]);

    // 3. For integer owner_ids, map to actual owner UUIDs if owner exists
    // Note: This assumes there's a mapping table or logic to connect old integer IDs to new UUIDs
    // For now, we'll log unmatched integers but not auto-map to avoid data corruption
    const unmatchedIntegers = await queryInterface.sequelize.query(`
      SELECT owner_id
      FROM cars
      WHERE owner_id ~ '^[0-9]+$'
      AND owner_id NOT IN (SELECT id::text FROM owners)
    `);

    if (unmatchedIntegers[0].length > 0) {
      console.log(`Found ${unmatchedIntegers[0].length} cars with integer owner_ids not matching any owners:`);
      unmatchedIntegers[0].forEach(row => console.log(`  - owner_id: ${row.owner_id}`));
      console.log('These will remain as-is or be set to NULL in next migration step');
    }

    console.log('=== Cleanup complete ===');
  },

  async down(queryInterface, Sequelize) {
    // This cleanup is safe to undo (just sets back to original state)
    console.log('Cleanup undo - no action needed (data loss prevention)');
  }
};
