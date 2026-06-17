const express = require('express');
const router = express.Router();
const multer = require('multer');
const liveStreamController = require('../controllers/LiveStreamController');

// Multer setup for frames
const upload = multer({ dest: 'uploads/temp/' });

router.post('/start-stream-analysis', liveStreamController.startSession);
router.post('/session/end', liveStreamController.endSession);
router.post('/stream-frame', upload.single("frame"), liveStreamController.processFrame);

module.exports = router;
