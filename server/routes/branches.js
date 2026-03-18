const express = require('express');
const router = express.Router();
const { Branch } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { branchValidation, branchArrayValidation, validate } = require('../middleware/validation');
const { Op } = require('sequelize');

// Get all branches
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.findAll({ where: { isActive: true } });
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create single branch (Admin, Super Admin)
router.post('/', protect, authorize('admin', 'super_admin'), branchValidation, validate, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email already exists in branches
    const existingBranch = await Branch.findOne({ where: { email } });
    if (existingBranch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists for another branch' 
      });
    }
    
    const branch = await Branch.create(req.body);
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create multiple branches (Admin, Super Admin)
router.post('/bulk', protect, authorize('admin', 'super_admin'), branchArrayValidation, validate, async (req, res) => {
  try {
    // Check if request body is an array
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Request body must be an array of branches' 
      });
    }

    // Extract all emails from the request
    const emails = req.body.map(branch => branch.email).filter(email => email);

    // Check for duplicate emails within the request array
    const emailCounts = {};
    const duplicateEmailsInRequest = [];
    
    emails.forEach(email => {
      emailCounts[email] = (emailCounts[email] || 0) + 1;
    });

    Object.keys(emailCounts).forEach(email => {
      if (emailCounts[email] > 1) {
        duplicateEmailsInRequest.push(email);
      }
    });

    if (duplicateEmailsInRequest.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Duplicate emails found in the request',
        duplicateEmails: duplicateEmailsInRequest
      });
    }

    // Check if any emails already exist in the database
    if (emails.length > 0) {
      const existingBranches = await Branch.findAll({
        where: {
          email: {
            [Op.in]: emails
          }
        }
      });

      if (existingBranches.length > 0) {
        const existingEmails = existingBranches.map(branch => branch.email);
        return res.status(400).json({ 
          success: false, 
          message: 'Some emails already exist in the database',
          existingEmails: existingEmails
        });
      }
    }

    // Create all branches
    const branches = await Branch.bulkCreate(req.body);
    
    res.status(201).json({ 
      success: true, 
      data: branches,
      message: `${branches.length} branches created successfully`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update branch
router.put('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const branch = await Branch.findByPk(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // If email is being updated, check if it's already used by another branch
    if (req.body.email && req.body.email !== branch.email) {
      const existingBranch = await Branch.findOne({
        where: {
          email: req.body.email,
          id: { [Op.ne]: req.params.id }
        }
      });

      if (existingBranch) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already exists for another branch' 
        });
      }
    }

    await branch.update(req.body);
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;