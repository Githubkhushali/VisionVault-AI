const express = require('express');
const router = express.Router();
const historyController = require('../controllers/HistoryController');

router.get('/', historyController.getHistory);
router.patch('/update-name', historyController.updateName);

module.exports = router;
