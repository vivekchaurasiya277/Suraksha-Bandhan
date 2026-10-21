const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

class JsonDatabase {
  constructor() {
    this.data = {
      users: {},
      profiles: {},
      sosEvents: [],
      hazardReports: [],
      safetyCheckins: [],
      activityLogs: []
    };
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = Object.assign(this.data, JSON.parse(raw));
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Error loading database:', err.message);
      this.save();
    }
  }

  save() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Error persisting database:', err.message);
    }
  }

  getProfile(userId = 'default') {
    return this.data.profiles[userId] || null;
  }

  saveProfile(userId = 'default', profileData) {
    this.data.profiles[userId] = {
      ...profileData,
      updatedAt: Date.now()
    };
    this.logActivity('save_profile', 'Profile saved to server', { userId });
    this.save();
    return this.data.profiles[userId];
  }

  createSosEvent(event) {
    const sosRecord = {
      id: 'SOS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
      timestamp: Date.now(),
      status: 'active',
      resolved: false,
      ...event
    };
    this.data.sosEvents.unshift(sosRecord);
    // keep maximum 100 recent SOS records
    if (this.data.sosEvents.length > 100) {
      this.data.sosEvents = this.data.sosEvents.slice(0, 100);
    }
    this.logActivity('sos_dispatched', 'SOS emergency triggered', { sosId: sosRecord.id, location: event.location });
    this.save();
    return sosRecord;
  }

  getSosHistory(limit = 20) {
    return this.data.sosEvents.slice(0, limit);
  }

  getSosEvent(sosId) {
    return this.data.sosEvents.find(e => e.id === sosId) || null;
  }

  resolveSosEvent(sosId, note = 'Resolved by citizen') {
    const event = this.data.sosEvents.find(e => e.id === sosId);
    if (event) {
      event.resolved = true;
      event.status = 'resolved';
      event.resolvedAt = Date.now();
      event.resolutionNote = note;
      this.logActivity('sos_resolved', `SOS ${sosId} marked resolved`, { sosId });
      this.save();
      return event;
    }
    return null;
  }

  createHazardReport(report) {
    const reportRecord = {
      id: 'REP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
      timestamp: Date.now(),
      status: 'verified',
      upvotes: 1,
      ...report
    };
    this.data.hazardReports.unshift(reportRecord);
    if (this.data.hazardReports.length > 100) {
      this.data.hazardReports = this.data.hazardReports.slice(0, 100);
    }
    this.logActivity('hazard_reported', `Hazard reported: ${report.type || 'Hazard'}`, { reportId: reportRecord.id });
    this.save();
    return reportRecord;
  }

  getHazardReports(limit = 30) {
    return this.data.hazardReports.slice(0, limit);
  }

  createSafetyCheckin(checkin) {
    const record = {
      id: 'CHK-' + Date.now(),
      timestamp: Date.now(),
      ...checkin
    };
    this.data.safetyCheckins.unshift(record);
    if (this.data.safetyCheckins.length > 100) {
      this.data.safetyCheckins = this.data.safetyCheckins.slice(0, 100);
    }
    this.logActivity('safety_checkin', `User checkin: Safe status declared`, { name: checkin.name });
    this.save();
    return record;
  }

  getSafetyCheckins(limit = 30) {
    return this.data.safetyCheckins.slice(0, limit);
  }

  logActivity(type, description, details = {}) {
    const entry = {
      id: 'LOG-' + Date.now(),
      timestamp: Date.now(),
      type,
      description,
      details
    };
    this.data.activityLogs.unshift(entry);
    if (this.data.activityLogs.length > 100) {
      this.data.activityLogs = this.data.activityLogs.slice(0, 100);
    }
    return entry;
  }

  getActivityLogs(limit = 30) {
    return this.data.activityLogs.slice(0, limit);
  }
}

module.exports = new JsonDatabase();
