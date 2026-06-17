const sessionService = require('../services/SessionService');

class HistoryController {
  async getHistory(req, res) {
    try {
      // Expose a separate /api/history endpoint that queries the database for all past sessions
      const history = await sessionService.getAllHistory();
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
