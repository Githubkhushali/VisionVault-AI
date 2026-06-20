class ThresholdLineTracker {
  constructor(frameHeight = 480, frameWidth = 640) {
    this.threshold = frameHeight / 2;
    this.frameWidth = frameWidth;
    this.identityMap = new Map();
    this.totalEntries = 0;
    this.totalExits = 0;
  }

  evaluate(identityId, bbox) {
    const centerY = bbox.y + bbox.height / 2;
    const isInside = centerY >= this.threshold;

    const prev = this.identityMap.get(identityId);
    let event = 'NONE';

    if (prev === undefined) {
      if (isInside) {
        event = 'ENTRY';
        this.totalEntries++;
        this.identityMap.set(identityId, {
          state: 'INSIDE', lastCenterY: centerY, crossings: 1, entries: 1, reentries: 0
        });
      } else {
        this.identityMap.set(identityId, {
          state: 'OUTSIDE', lastCenterY: centerY, crossings: 0, entries: 0, reentries: 0
        });
      }
    } else {
      const prevState = prev.state || (prev.lastCenterY >= this.threshold ? 'INSIDE' : 'OUTSIDE');

      if (isInside && prevState === 'OUTSIDE') {
        event = 'ENTRY';
        this.totalEntries++;
        const newEntries = (prev.entries || 0) + 1;
        const newReentries = newEntries > 1 ? (prev.reentries || 0) + 1 : (prev.reentries || 0);

        this.identityMap.set(identityId, {
          state: 'INSIDE', lastCenterY: centerY, crossings: (prev.crossings || 0) + 1, entries: newEntries, reentries: newReentries
        });
      } else if (!isInside && prevState === 'INSIDE') {
        event = 'EXIT';
        this.totalExits++;
        this.identityMap.set(identityId, {
          ...prev, state: 'OUTSIDE', lastCenterY: centerY, crossings: (prev.crossings || 0) + 1,
        });
      } else {
        this.identityMap.set(identityId, { ...prev, lastCenterY: centerY });
      }
    }

    const currentData = this.identityMap.get(identityId);
    return {
      event,
      crossings: currentData.crossings,
      entries: currentData.entries,
      reentries: currentData.reentries
    };
  }

  getSnapshot() {
    return {
      totalEntries: this.totalEntries,
      totalExits: this.totalExits,
      identities: Object.fromEntries(this.identityMap),
    };
  }

  reset() {
    this.identityMap.clear();
    this.totalEntries = 0;
    this.totalExits = 0;
  }
}

class LiveStreamService {
  constructor() {
    this.active = false;
    this.sessionId = null;
    this.startTime = null;
    this.currentUserId = null;   // user who started the session
    this.faceLog = new Map();
    this.tracker = new ThresholdLineTracker(480, 640);
  }

  startSession(userId = null) {
    if (this.active) {
      throw new Error('Stream session already active.');
    }
    this.active = true;
    this.startTime = Date.now();
    this.sessionId = `live_${Date.now()}`;
    this.currentUserId = userId;   // ← tag session to the user who started it
    this.faceLog.clear();
    this.tracker.reset();
    return this.sessionId;
  }

  recordFaceAppearance(identityId, s3Url = null, trackerResult = null) {
    if (!this.active) return;
    
    if (!this.faceLog.has(identityId)) {
      this.faceLog.set(identityId, {
        identityId,
        appearanceCount: 1,
        s3Url,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        trackerData: trackerResult
      });
    } else {
      const entry = this.faceLog.get(identityId);
      entry.appearanceCount++;
      entry.lastSeen = Date.now();
      if (s3Url && !entry.s3Url) entry.s3Url = s3Url;
      if (trackerResult) entry.trackerData = trackerResult;
    }
  }

  getCompiledSessionData() {
    if (!this.active) return null;

    const endTime = Date.now();
    const durationMs = endTime - this.startTime;
    const snapshot = this.tracker.getSnapshot();

    const faceList = [...this.faceLog.values()].sort((a, b) => b.appearanceCount - a.appearanceCount);
    const facesWithCrossings = faceList.map(face => ({
      ...face,
      crossings: snapshot.identities[face.identityId]?.crossings ?? 0,
    }));

    return {
      sessionId: this.sessionId,
      userId: this.currentUserId,   // ← included in compiled data
      startTime: this.startTime,
      endTime,
      durationMs,
      totalEntries: snapshot.totalEntries,
      totalExits: snapshot.totalExits,
      uniqueFacesCount: faceList.length,
      faces: facesWithCrossings
    };
  }

  resetSession() {
    this.active = false;
    const endedId = this.sessionId;
    this.sessionId = null;
    this.currentUserId = null;
    this.faceLog.clear();
    this.tracker.reset();
    return endedId;
  }
}

module.exports = new LiveStreamService();
