const express = require('express');
const router = express.Router();
const multer = require('multer');
const liveStreamController = require('../controllers/LiveStreamController');
const { authMiddleware } = require('../middleware/auth');

// Multer setup for frames
const upload = multer({ dest: 'uploads/temp/' });

// All live-stream routes require authentication
router.post('/start-stream-analysis', authMiddleware, liveStreamController.startSession);
router.post('/session/end', authMiddleware, liveStreamController.endSession);
router.post('/stream-frame', authMiddleware, upload.single('frame'), liveStreamController.processFrame);

module.exports = router;
