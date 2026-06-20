const express = require('express');
const router = express.Router();
const historyController = require('../controllers/HistoryController');
const { authMiddleware } = require('../middleware/auth');

// All history routes require authentication
router.get('/', authMiddleware, historyController.getHistory);
router.patch('/update-name', authMiddleware, historyController.updateName);

module.exports = router;
