'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('cars');
    console.log('Current cars.branch_id info:', tableInfo.branch_id);

    // 1. Safely remove existing constraint if exists
    const constraints = await queryInterface.sequelize.query(
      `SELECT conname FROM pg_constraint 
       WHERE conrelid = 'cars'::regclass AND confrelid = 'branches'::regclass`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    for (const constraint of constraints) {
      try {
        await queryInterface.removeConstraint('cars', constraint.conname);
        console.log(`Removed constraint: ${constraint.conname}`);
      } catch (e) {
        console.log(`Constraint ${constraint.conname} removal skipped:`, e.message);
      }
    }

    // 2. Clean invalid UUID branch_ids - set to 1 (default branch)
    await queryInterface.sequelize.query(
      `UPDATE cars 
       SET branch_id = 1 
       WHERE branch_id IS NOT NULL 
         AND branch_id::text ~ '^[a-f0-9-]{36}$'
         AND branch_id != '1'`
    );
    const cleanedCount = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM cars WHERE branch_id = 1 AND branch_id::text ~ '^[a-f0-9-]{36}$'`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    console.log(`Cleaned ${cleanedCount[0].count} UUID branch_ids to 1`);

    // 3. Handle NULLs - set to 1
    await queryInterface.sequelize.query(
      `UPDATE cars SET branch_id = 1 WHERE branch_id IS NULL`
    );
    const nullCount = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM cars WHERE branch_id IS NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    console.log(`Fixed ${nullCount[0].count} NULL branch_ids to 1`);

    // 4. Ensure default branch 1 exists
    await queryInterface.sequelize.query(
      `INSERT INTO branches (id, name, address, city, state, zipCode, phone, email, isActive, createdAt, updatedAt) 
       VALUES (1, 'Default Branch', 'Default Address', 'Default City', 'Default State', '12345', '1234567890', 'default@branch.com', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`
    );

    // 5. Change column type to INTEGER
    await queryInterface.sequelize.query(
      `ALTER TABLE cars ALTER COLUMN branch_id TYPE INTEGER USING (branch_id::INTEGER)`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE cars ALTER COLUMN branch_id SET NOT NULL`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE cars ALTER COLUMN branch_id SET DEFAULT 1`
    );

    // 6. Add foreign key constraint
    await queryInterface.addConstraint('cars', {
      fields: ['branch_id'],
      type: 'foreign key',
      name: 'cars_branch_id_fkey',
      references: {
        table: 'branches',
        field: 'id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    console.log('✅ Migration completed successfully');
  },

  async down(queryInterface, Sequelize) {
    // Remove constraint
    try {
      await queryInterface.removeConstraint('cars', 'cars_branch_id_fkey');
    } catch (e) {
      console.log('Down migration constraint removal skipped');
    }

    // Revert to UUID
    await queryInterface.sequelize.query(
      `ALTER TABLE cars ALTER COLUMN branch_id DROP DEFAULT`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE cars ALTER COLUMN branch_id DROP NOT NULL`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE cars ALTER COLUMN branch_id TYPE UUID USING gen_random_uuid()`
    );
  }
};

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeConstraint('cars', 'cars_branch_id_fkey');
    } catch (error) {
      console.log('Constraint removal skipped');
    }

    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE cars ALTER COLUMN branch_id TYPE UUID USING gen_random_uuid()'
      );
    } catch (error) {
      console.log('Rollback skipped:', error.message);
    }
  }
};