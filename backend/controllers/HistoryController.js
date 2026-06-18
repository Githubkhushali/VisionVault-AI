const sessionService = require('../services/SessionService');

class HistoryController {
  async getHistory(req, res) {
    try {
      const s3Service = require('../services/S3Service');
      const history = await sessionService.getAllHistory();
      
      for (const s of history) {
        if (s.s3Url) {
          s.s3Url = await s3Service.getPresignedUrl(s.s3Url);
        }
        if (s.people && s.people.length > 0) {
          for (const p of s.people) {
            if (p.s3CropUrl) {
              p.s3CropUrl = await s3Service.getPresignedUrl(p.s3CropUrl);
            }
          }
        }
      }
      
      res.status(200).json({ sessions: history });
    } catch (error) {
      console.error("[HistoryController] Failed to fetch history:", error);
      res.status(500).json({ error: "Failed to fetch history." });
    }
  }

  async updateName(req, res) {
    try {
      const { identityId, newName } = req.body;
      if (!identityId || !newName) {
        return res.status(400).json({ error: "Missing identityId or newName" });
      }

      // Fault-Tolerant Name Updates: /api/history/update-name PATCH endpoint
      await sessionService.updateFaceName(identityId, newName);
      
      res.status(200).json({ success: true, message: "Name updated successfully" });
    } catch (error) {
      console.error("[HistoryController] Failed to update name:", error);
      res.status(500).json({ error: "Failed to update name." });
    }
  }
}

module.exports = new HistoryController();
