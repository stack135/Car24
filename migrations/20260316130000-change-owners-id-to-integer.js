'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Starting migration to fix owners.id to INTEGER...');

    // Check if owners table exists and what type the id is
    const tableExists = await queryInterface.tableExists('owners');
    if (!tableExists) {
      console.log('Owners table does not exist, skipping migration');
      return;
    }

    const ownersTable = await queryInterface.describeTable('owners');
    console.log('Current owners.id type:', ownersTable.id?.type);

    if (ownersTable.id?.type === 'INTEGER') {
      console.log('owners.id is already INTEGER, skipping migration');
      return;
    }

    // Remove foreign key constraint
    try {
      await queryInterface.removeConstraint('cars', 'cars_owner_id_fkey');
      console.log('Removed foreign key constraint');
    } catch (error) {
      console.log('Foreign key constraint removal skipped:', error.message);
    }

    // Since changing UUID to INTEGER is complex and may lose data,
    // we'll recreate the owners table with correct schema
    // First, backup existing data
    const existingOwners = await queryInterface.sequelize.query(
      'SELECT * FROM owners',
      { type: Sequelize.QueryTypes.SELECT }
    );

    console.log(`Found ${existingOwners.length} existing owners`);

    // Drop and recreate owners table with correct schema
    await queryInterface.dropTable('owners');

    await queryInterface.createTable('owners', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      businessName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      businessLicense: {
        type: Sequelize.STRING,
        allowNull: false
      },
      panNumber: {
        type: Sequelize.STRING,
        allowNull: false
      },
      gstNumber: {
        type: Sequelize.STRING,
        allowNull: true
      },
      bankAccountNumber: {
        type: Sequelize.STRING,
        allowNull: false
      },
      ifscCode: {
        type: Sequelize.STRING,
        allowNull: false
      },
      upiId: {
        type: Sequelize.STRING,
        allowNull: false
      },
      approvalStatus: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    // Re-insert the backed up data with new integer IDs
    if (existingOwners.length > 0) {
      const ownersToInsert = existingOwners.map(owner => ({
        userId: owner.user_id,
        businessName: owner.businessname || owner.businessName,
        businessLicense: owner.businesslicense || owner.businessLicense,
        panNumber: owner.pannumber || owner.panNumber,
        gstNumber: owner.gstnumber || owner.gstNumber,
        bankAccountNumber: owner.bankaccountnumber || owner.bankAccountNumber,
        ifscCode: owner.ifsccode || owner.ifscCode,
        upiId: owner.upiid || owner.upiId,
        approvalStatus: owner.approvalstatus || owner.approvalStatus,
        isActive: owner.isactive || owner.isActive,
        createdAt: owner.created_at || owner.createdAt,
        updatedAt: owner.updated_at || owner.updatedAt
      }));

      await queryInterface.bulkInsert('owners', ownersToInsert);
      console.log(`Re-inserted ${ownersToInsert.length} owners with new INTEGER IDs`);
    }

    // Add index
    await queryInterface.addIndex('owners', ['userId']);

    // Ensure cars.owner_id is INTEGER
    const carsTable = await queryInterface.describeTable('cars');
    if (carsTable.owner_id?.type !== 'INTEGER') {
      await queryInterface.sequelize.query(
        'ALTER TABLE cars ALTER COLUMN owner_id TYPE INTEGER USING owner_id::integer'
      );
    }

    // Re-add the foreign key constraint
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
      console.log('Re-added foreign key constraint');
    } catch (error) {
      console.log('Foreign key creation skipped:', error.message);
    }

    console.log('Successfully changed owners.id to INTEGER');
  },

  async down(queryInterface, Sequelize) {
    console.log('Reverting owners.id back to UUID...');

    // This down migration will recreate the table as UUID
    try {
      await queryInterface.removeConstraint('cars', 'cars_owner_id_fkey');
    } catch (error) {
      console.log('Foreign key constraint removal skipped');
    }

    // Drop and recreate as UUID
    await queryInterface.dropTable('owners');

    await queryInterface.createTable('owners', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      businessName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      businessLicense: {
        type: Sequelize.STRING,
        allowNull: false
      },
      panNumber: {
        type: Sequelize.STRING,
        allowNull: false
      },
      gstNumber: {
        type: Sequelize.STRING,
        allowNull: true
      },
      bankAccountNumber: {
        type: Sequelize.STRING,
        allowNull: false
      },
      ifscCode: {
        type: Sequelize.STRING,
        allowNull: false
      },
      upiId: {
        type: Sequelize.STRING,
        allowNull: false
      },
      approvalStatus: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('owners', ['userId']);

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

    console.log('Reverted owners.id back to UUID');
  }
};