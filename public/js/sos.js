// Emergency SOS & Safety Check-in Controller for Suraksha Bandhan
const SosController = {
  isHolding: false,
  holdTimer: null,
  countdownInterval: null,
  holdDuration: 3000,
  countdownRemaining: 3,

  init() {
    const sosBtn = document.getElementById('sosBtn');
    if (!sosBtn) return;

    const start = (e) => {
      // Don't trigger on secondary clicks
      if (e.type === 'mousedown' && e.button !== 0) return;
      this.startHold();
    };

    const cancel = () => {
      this.cancelHold();
    };

    sosBtn.addEventListener('mousedown', start);
    sosBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      start(e);
    }, { passive: false });

    window.addEventListener('mouseup', cancel);
    window.addEventListener('touchend', cancel);
    window.addEventListener('touchcancel', cancel);
  },

  startHold() {
    if (this.isHolding) return;
    this.isHolding = true;
    this.countdownRemaining = 3;

    const btn = document.getElementById('sosBtn');
    const countdown = document.getElementById('sosCountdown');
    const hint = document.getElementById('sosHint');

    btn.classList.add('holding');
    countdown.style.display = 'flex';
    countdown.textContent = this.countdownRemaining;
    hint.textContent = 'Keep holding for SOS activation...';
    hint.style.color = 'var(--primary)';

    // Play light pre-alarm chime & mobile haptic pulse
    if (window.VoiceEngine) {
      window.VoiceEngine.playChime();
    }
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    this.countdownInterval = setInterval(() => {
      this.countdownRemaining--;
      if (this.countdownRemaining > 0) {
        countdown.textContent = this.countdownRemaining;
        if (window.VoiceEngine) window.VoiceEngine.playChime();
        if (navigator.vibrate) navigator.vibrate(60);
      }
    }, 1000);

    this.holdTimer = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
      this.triggerEmergencySos();
    }, this.holdDuration);
  },

  cancelHold() {
    if (!this.isHolding) return;
    this.isHolding = false;
    clearTimeout(this.holdTimer);
    clearInterval(this.countdownInterval);

    const btn = document.getElementById('sosBtn');
    const countdown = document.getElementById('sosCountdown');
    const hint = document.getElementById('sosHint');

    btn.classList.remove('holding');
    countdown.style.display = 'none';
    if (window.I18N) {
      hint.textContent = window.I18N.get('sosHint');
    } else {
      hint.textContent = 'Hold 3s to alert emergency contacts & dispatch GPS';
    }
    hint.style.color = '';
  },

  async triggerEmergencySos() {
    this.cancelHold();

    // Start siren immediately
    if (window.VoiceEngine) {
      window.VoiceEngine.startEmergencySiren();
    }

    const state = window.AppState || {};
    const profile = state.userProfile || {};
    const coords = state.userLocation || { lat: 26.4499, lon: 80.3319, city: 'Kanpur' };

    const payload = {
      name: profile.name || 'Citizen in Distress',
      phone: profile.phone || '',
      lat: coords.lat,
      lon: coords.lon,
      city: coords.city || 'Detected Location',
      medicalInfo: profile.medicalInfo || {},
      emergencyContacts: profile.emergencyContacts || []
    };

    // 1. Post to backend
    try {
      const resp = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      console.log('SOS API Response:', data);
    } catch (err) {
      console.warn('Backend SOS dispatch failed, relying on offline triggers:', err);
    }

    // 2. Prepare message for contacts
    const mapUrl = coords.lat ? `https://maps.google.com/?q=${coords.lat},${coords.lon}` : 'GPS pending';
    const sosMsg = `🚨 EMERGENCY SOS ALERT!
I need immediate help!
Name: ${payload.name}
Phone: ${payload.phone}
Location: ${coords.city || ''} (${coords.lat ? coords.lat.toFixed(4) : ''}, ${coords.lon ? coords.lon.toFixed(4) : ''})
Map: ${mapUrl}
${payload.medicalInfo.bloodGroup ? 'Blood Group: ' + payload.medicalInfo.bloodGroup : ''}
Sent via Suraksha Bandhan Emergency App`;

    // 3. Show emergency SOS dialog with 1-tap call & WhatsApp / SMS broadcast
    this.sosModalActive = true;
    this.showSosActiveModal(payload, sosMsg);

    // 4. Voice announcement in the user's active language
    if (window.VoiceEngine) {
      const activeLang = (window.I18N && window.I18N.currentLang) ? window.I18N.currentLang : 'hi';
      const sosAnnouncement = (window.I18N && window.I18N.get('sosActivated')) 
        ? window.I18N.get('sosActivated') 
        : 'एसओएस सक्रिय कर दिया गया है। 112 आपातकालीन सेवा को कॉल किया जा रहा है।';
      window.VoiceEngine.speak(sosAnnouncement, activeLang);
    }

    // Auto-dial after 4 seconds if not cancelled by user
    this.autoDialTimer = setTimeout(() => {
      if (this.sosModalActive) {
        window.location.href = 'tel:112';
      }
    }, 4500);
  },

  showSosActiveModal(payload, sosMsg) {
    const isHi = window.I18N && window.I18N.currentLang === 'hi';
    const modalBody = `
      <div style="text-align:center;padding:10px 0;">
        <div style="font-size:48px;color:#e74c3c;animation:pulseVoice 1s infinite;">
          <i class="fas fa-tower-broadcast"></i>
        </div>
        <h3 style="color:var(--primary);font-size:22px;margin:12px 0 6px;">
          ${isHi ? '🚨 एसओएस सक्रिय हुआ!' : '🚨 SOS ACTIVATED!'}
        </h3>
        <p style="font-size:13px;color:var(--text2);margin-bottom:6px;">
          ${isHi ? '4 सेकंड में <strong>112 (राष्ट्रीय आपातकाल)</strong> को कॉल किया जा रहा है।' : 'Calling <strong>112 (National Emergency)</strong> in 4 seconds.'}
        </p>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">
          ${isHi ? '(यदि गलती से दब गया हो, तो नीचे "रद्द करें" बटन दबाएं)' : '(If pressed by mistake, tap Cancel below)'}
        </p>

        <div class="sos-action-grid">
          <a href="tel:112" class="sos-modal-btn btn-call112">
            <i class="fas fa-phone-volume"></i> ${isHi ? 'अभी 112 डायल करें' : 'Call 112 (National)'}
          </a>
          <a href="tel:108" class="sos-modal-btn btn-call108">
            <i class="fas fa-ambulance"></i> ${isHi ? '108 एम्बुलेंस को कॉल करें' : 'Call 108 (Ambulance)'}
          </a>
          <a href="https://wa.me/?text=${encodeURIComponent(sosMsg)}" target="_blank" class="sos-modal-btn btn-whatsapp">
            <i class="fab fa-whatsapp"></i> ${isHi ? 'WhatsApp पर परिजनों को भेजें' : 'Broadcast on WhatsApp'}
          </a>
          <a href="sms:?body=${encodeURIComponent(sosMsg)}" class="sos-modal-btn btn-sms">
            <i class="fas fa-comment-sms"></i> ${isHi ? 'एसएमएस (SMS) द्वारा भेजें' : 'Send Emergency SMS'}
          </a>
        </div>

        <div style="margin-top:16px;">
          <button class="btn-cancel-sos" onclick="SosController.dismissSosModal()" style="background:var(--bg3);padding:10px 20px;font-size:13px;font-weight:800;color:var(--text);">
            <i class="fas fa-circle-xmark"></i> ${isHi ? 'रद्द करें (गलती से दब गया)' : 'Cancel SOS (False Alarm)'}
          </button>
        </div>
      </div>
    `;

    if (window.openGenericModal) {
      window.openGenericModal(isHi ? 'आपातकालीन प्रसारण' : 'Emergency Broadcast', modalBody);
    }
  },

  dismissSosModal() {
    this.sosModalActive = false;
    if (this.autoDialTimer) {
      clearTimeout(this.autoDialTimer);
      this.autoDialTimer = null;
    }
    if (window.VoiceEngine) {
      window.VoiceEngine.stopEmergencySiren();
      window.VoiceEngine.stop();
    }
    if (window.closeGenericModal) {
      window.closeGenericModal();
    }
    if (window.showToast) {
      window.showToast('SOS siren cancelled.', 'info');
    }
  },

  // "I Am Safe" Family Check-In Generator
  async triggerSafeCheckin() {
    const state = window.AppState || {};
    const profile = state.userProfile || {};
    const coords = state.userLocation || { lat: 26.4499, lon: 80.3319, city: 'Kanpur' };
    const name = profile.name || prompt('Please enter your name for the safety status:', 'Citizen');
    if (!name) return;

    const mapUrl = coords.lat ? `https://maps.google.com/?q=${coords.lat},${coords.lon}` : '';
    const safeMsg = `🟢 I AM SAFE!
This is a safety confirmation from ${name}.
Location: ${coords.city || 'Secure Area'}
${mapUrl ? 'Map: ' + mapUrl : ''}
Time: ${new Date().toLocaleTimeString()}
Status: Out of danger and in a secure safe zone.
(Shared via Suraksha Bandhan Disaster Response)`;

    // Post to backend registry
    try {
      await fetch('/api/safety-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: profile.phone || '',
          lat: coords.lat,
          lon: coords.lon,
          city: coords.city || 'Safe Area',
          message: 'I am safe and in a secure location.'
        })
      });
    } catch (_) {}

    const modalBody = `
      <div style="text-align:center;padding:12px 0;">
        <div style="font-size:48px;color:var(--success);margin-bottom:8px;">
          <i class="fas fa-circle-check"></i>
        </div>
        <h3 style="color:var(--success);margin-bottom:6px;">Status: I Am Safe</h3>
        <p style="font-size:13px;color:var(--text2);margin-bottom:16px;">
          Share your safe status and GPS coordinates with your family and relatives via WhatsApp or SMS.
        </p>

        <div style="background:var(--bg2);padding:14px;border-radius:12px;font-size:12px;text-align:left;margin-bottom:16px;white-space:pre-wrap;border:1px solid var(--border);">${safeMsg}</div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <a href="https://wa.me/?text=${encodeURIComponent(safeMsg)}" target="_blank" class="sos-modal-btn btn-whatsapp" style="justify-content:center;">
            <i class="fab fa-whatsapp"></i> Share on WhatsApp
          </a>
          <a href="sms:?body=${encodeURIComponent(safeMsg)}" class="sos-modal-btn btn-sms" style="justify-content:center;">
            <i class="fas fa-comment-sms"></i> Share via SMS
          </a>
          <button class="btn-copy-status" onclick="SosController.copyTextToClipboard('${encodeURIComponent(safeMsg)}')">
            <i class="fas fa-copy"></i> Copy Message to Clipboard
          </button>
        </div>
      </div>
    `;

    if (window.openGenericModal) {
      window.openGenericModal('Safe Check-in Status', modalBody);
    }
  },

  copyTextToClipboard(encoded) {
    const text = decodeURIComponent(encoded);
    navigator.clipboard.writeText(text).then(() => {
      if (window.showToast) window.showToast('Copied to clipboard!', 'success');
    }).catch(() => {
      if (window.showToast) window.showToast('Select text to copy manually', 'info');
    });
  }
};

window.SosController = SosController;
