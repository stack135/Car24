'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.tableExists('owners');
    
    if (tableExists) {
      console.log('Owners table already exists, checking columns...');
      const table = await queryInterface.describeTable('owners');
      console.log('Existing columns:', Object.keys(table));
      return;
    }

    await queryInterface.createTable('owners', {
      id: {
    type: DataTypes.INTEGER,  // Changed from UUID to INTEGER
    primaryKey: true,
    autoIncrement: true  // Auto-incrementing integer
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('owners');
  }
};