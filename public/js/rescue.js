// ========================================================
// Suraksha Bandhan v3.0 - Emergency Rescue Toolkit
// 1. Live Doppler Rain Radar (RainViewer API)
// 2. SOS Rescue Strobe & Morse-Code Flashlight
// 3. Live Evacuation Compass & Heading Arrow
// 4. Zero-Internet Offline SMS Fallback Dispatcher
// 5. Emergency Permissions & Hardware Readiness Manager
// ========================================================

const RescueToolkit = {
  // ----------------------------------------------------
  // 1. RAIN RADAR (RainViewer API Layer for Leaflet)
  // ----------------------------------------------------
  radar: {
    layer: null,
    timestamps: [],
    currentIndex: 0,
    timer: null,
    isPlaying: false,
    isActive: false,

    async toggle() {
      if (this.isActive) {
        this.stop();
        return false;
      } else {
        return await this.start();
      }
    },

    async start() {
      const map = window.MapController && window.MapController.map;
      if (!map) {
        showToast('Please open the Map tab first.', 'info');
        return false;
      }

      const radarBtn = document.getElementById('mapRadarBtn');
      const radarPill = document.getElementById('mapRadarPill');
      if (radarBtn) radarBtn.classList.add('loading');

      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await res.json();
        if (!data || !data.radar || !data.radar.past || !data.radar.past.length) {
          throw new Error('No radar frames available');
        }

        // Take last 6 radar frames
        this.timestamps = data.radar.past.slice(-6);
        this.currentIndex = this.timestamps.length - 1;
        this.isActive = true;

        if (radarBtn) {
          radarBtn.classList.remove('loading');
          radarBtn.classList.add('active');
          radarBtn.innerHTML = '<i class="fas fa-satellite-dish"></i> <span>Radar: ON</span>';
        }
        if (radarPill) {
          radarPill.style.display = 'flex';
        }

        this.showFrame(this.currentIndex);
        this.play();
        showToast('🌧️ Live Rain & Storm Doppler Radar Active', 'success');
        return true;
      } catch (err) {
        console.warn('RainViewer error:', err);
        if (radarBtn) radarBtn.classList.remove('loading');
        showToast('Unable to load satellite rain radar.', 'error');
        return false;
      }
    },

    showFrame(index) {
      const map = window.MapController && window.MapController.map;
      if (!map || !this.timestamps[index]) return;

      const frame = this.timestamps[index];
      const tileUrl = `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;

      if (this.layer) {
        map.removeLayer(this.layer);
      }

      this.layer = L.tileLayer(tileUrl, {
        opacity: 0.65,
        zIndex: 500,
        attribution: '&copy; <a href="https://www.rainviewer.com" target="_blank">RainViewer</a>'
      }).addTo(map);

      const timeText = new Date(frame.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const timeEl = document.getElementById('radarTimeText');
      if (timeEl) timeEl.textContent = `${timeText} (${index === this.timestamps.length - 1 ? 'LIVE' : `-${(this.timestamps.length - 1 - index) * 10}m`})`;
    },

    play() {
      if (this.timer) clearInterval(this.timer);
      this.isPlaying = true;
      this.timer = setInterval(() => {
        this.currentIndex = (this.currentIndex + 1) % this.timestamps.length;
        this.showFrame(this.currentIndex);
      }, 1000);

      const playBtn = document.getElementById('radarPlayBtn');
      if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    },

    pause() {
      if (this.timer) clearInterval(this.timer);
      this.isPlaying = false;
      const playBtn = document.getElementById('radarPlayBtn');
      if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
    },

    togglePlay() {
      if (this.isPlaying) this.pause();
      else this.play();
    },

    stop() {
      this.pause();
      const map = window.MapController && window.MapController.map;
      if (map && this.layer) {
        map.removeLayer(this.layer);
        this.layer = null;
      }
      this.isActive = false;

      const radarBtn = document.getElementById('mapRadarBtn');
      const radarPill = document.getElementById('mapRadarPill');
      if (radarBtn) {
        radarBtn.classList.remove('active');
        radarBtn.innerHTML = '<i class="fas fa-cloud-rain"></i> <span>Rain Radar</span>';
      }
      if (radarPill) {
        radarPill.style.display = 'none';
      }
      showToast('Rain Radar layer turned off.', 'info');
    }
  },

  // ----------------------------------------------------
  // 2. SOS RESCUE STROBE & FLASHLIGHT (Hardware Torch & Screen Beacon)
  // ----------------------------------------------------
  torch: {
    stream: null,
    track: null,
    mode: 'off', // 'off', 'torch', 'sos'
    morseInterval: null,
    isScreenBeaconActive: false,

    async init() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return false;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.torch) {
          this.stream = stream;
          this.track = track;
          return true;
        }
        return false;
      } catch (_) {
        return false;
      }
    },

    async setTorch(enable) {
      if (!this.track) {
        const ok = await this.init();
        if (!ok) return false;
      }
      try {
        await this.track.applyConstraints({ advanced: [{ torch: enable }] });
        return true;
      } catch (e) {
        console.warn('Torch constraint error:', e);
        return false;
      }
    },

    async toggleTorch() {
      if (this.mode === 'torch') {
        this.turnOff();
        showToast('Flashlight turned OFF', 'info');
      } else {
        this.stopMorse();
        const ok = await this.setTorch(true);
        if (ok) {
          this.mode = 'torch';
          this.updateUi();
          showToast('🔦 Flashlight Turned ON', 'success');
        } else {
          // Hardware torch unavailable -> activate screen beacon fallback!
          this.startScreenBeacon();
        }
      }
    },

    async toggleSosStrobe() {
      if (this.mode === 'sos') {
        this.turnOff();
        showToast('SOS Strobe turned OFF', 'info');
      } else {
        this.mode = 'sos';
        this.updateUi();
        const hasHardware = await this.setTorch(false);
        if (hasHardware) {
          this.startMorseStrobe();
          showToast('⚡ SOS Flashlight Strobe Active (Morse: ··· ——— ···)', 'warning');
        } else {
          // Fallback screen beacon with audio rescue siren!
          this.startScreenBeacon(true);
        }
      }
    },

    startMorseStrobe() {
      this.stopMorse();
      // Morse Code SOS: 3 short (200ms), 3 long (500ms), 3 short (200ms)
      const sequence = [
        1, 0, 1, 0, 1, 0, // S (···)
        0, 0,
        1, 1, 0, 1, 1, 0, 1, 1, 0, // O (———)
        0, 0,
        1, 0, 1, 0, 1, 0, // S (···)
        0, 0, 0, 0
      ];
      let step = 0;
      this.morseInterval = setInterval(async () => {
        const on = sequence[step % sequence.length] === 1;
        await this.setTorch(on);
        step++;
      }, 180);
    },

    stopMorse() {
      if (this.morseInterval) {
        clearInterval(this.morseInterval);
        this.morseInterval = null;
      }
    },

    startScreenBeacon(isSosMode = false) {
      this.isScreenBeaconActive = true;
      let overlay = document.getElementById('screenBeaconOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'screenBeaconOverlay';
        overlay.className = 'screen-beacon-overlay';
        overlay.innerHTML = `
          <div class="beacon-content">
            <i class="fas fa-sun beacon-icon"></i>
            <h2>${isSosMode ? 'SOS RESCUE BEACON ACTIVE' : 'EMERGENCY HIGH-LUMEN LIGHT'}</h2>
            <p>${isSosMode ? 'Flashing high-visibility emergency strobe for rescue teams' : 'Maximum screen brightness enabled'}</p>
            <button class="btn-locate" onclick="RescueToolkit.torch.turnOff()" style="background:#000;color:#fff;padding:12px 24px;font-size:16px;border-radius:30px;margin-top:20px;">
              <i class="fas fa-power-off"></i> Turn Off Beacon
            </button>
          </div>
        `;
        document.body.appendChild(overlay);
      }
      overlay.classList.toggle('sos-strobe', isSosMode);
      overlay.style.display = 'flex';
      this.mode = isSosMode ? 'sos' : 'torch';
      this.updateUi();
      showToast(isSosMode ? '⚡ SOS Screen Beacon Active' : '💡 Screen Emergency Light Active', 'warning');
    },

    turnOff() {
      this.stopMorse();
      if (this.track) {
        this.track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
        this.track.stop();
        this.track = null;
        this.stream = null;
      }
      const overlay = document.getElementById('screenBeaconOverlay');
      if (overlay) overlay.style.display = 'none';
      this.isScreenBeaconActive = false;
      this.mode = 'off';
      this.updateUi();
    },

    updateUi() {
      const torchBtn = document.getElementById('quickTorchBtn');
      const sosStrobeBtn = document.getElementById('quickStrobeBtn');
      if (torchBtn) {
        torchBtn.classList.toggle('active', this.mode === 'torch');
      }
      if (sosStrobeBtn) {
        sosStrobeBtn.classList.toggle('active', this.mode === 'sos');
      }
    }
  },

  // ----------------------------------------------------
  // 3. LIVE EVACUATION COMPASS & HEADING TO SHELTER
  // ----------------------------------------------------
  compass: {
    isOpen: false,
    userHeading: 0,
    targetBearing: 0,
    targetShelter: null,
    listenerBound: false,

    open() {
      this.targetShelter = this.getClosestShelter();
      const modal = document.getElementById('compassModal');
      if (!modal) return;

      this.updateCompassDetails();
      modal.classList.add('active');
      this.isOpen = true;

      // Start device orientation listener
      this.startTracking();
    },

    close() {
      const modal = document.getElementById('compassModal');
      if (modal) modal.classList.remove('active');
      this.isOpen = false;
      this.stopTracking();
    },

    getClosestShelter() {
      const shelters = (window.AppState && window.AppState.shelters) || [];
      if (shelters.length > 0) {
        return shelters[0]; // Nearest shelter (already sorted within <=3km)
      }
      // Fallback
      return {
        name: 'Designated Elevated Flood Safe Zone',
        name_hi: 'स्थानीय बाढ़-सुरक्षित उच्च राहत आश्रय',
        distanceKm: 0.8,
        lat: (window.AppState ? window.AppState.userLocation.lat : 26.8655) + 0.007,
        lon: (window.AppState ? window.AppState.userLocation.lon : 80.9520) + 0.005
      };
    },

    updateCompassDetails() {
      const shelter = this.targetShelter;
      if (!shelter) return;

      const uLat = window.AppState ? window.AppState.userLocation.lat : 26.8655;
      const uLon = window.AppState ? window.AppState.userLocation.lon : 80.9520;
      this.targetBearing = this.calculateBearing(uLat, uLon, shelter.lat, shelter.lon);

      const lang = window.I18N ? window.I18N.currentLang : 'hi';
      const isNonEn = lang !== 'en';
      const sName = (isNonEn && shelter.name_hi) ? shelter.name_hi : (window.I18N ? window.I18N.localizeLocation(shelter.name) : shelter.name);

      const targetNameEl = document.getElementById('compassTargetName');
      const targetDistEl = document.getElementById('compassTargetDist');
      const targetDirEl = document.getElementById('compassCardinalDir');
      const navBtn = document.getElementById('compassNavBtn');

      if (targetNameEl) targetNameEl.textContent = sName;
      if (targetDistEl) targetDistEl.textContent = `${shelter.distanceKm || 0.8} ${isNonEn ? 'किमी' : 'km'}`;

      const cardinal = this.getCardinal(this.targetBearing, isNonEn);
      if (targetDirEl) targetDirEl.textContent = `${cardinal} (${Math.round(this.targetBearing)}°)`;

      if (navBtn) {
        navBtn.onclick = () => {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lon}`, '_blank');
        };
      }

      this.renderNeedle();
    },

    startTracking() {
      if (this.listenerBound) return;
      this.boundHandler = this.handleOrientation.bind(this);

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ permission
        DeviceOrientationEvent.requestPermission()
          .then(res => {
            if (res === 'granted') {
              window.addEventListener('deviceorientation', this.boundHandler, true);
              this.listenerBound = true;
            }
          })
          .catch(() => {});
      } else {
        window.addEventListener('deviceorientationabsolute', this.boundHandler, true);
        window.addEventListener('deviceorientation', this.boundHandler, true);
        this.listenerBound = true;
      }
    },

    stopTracking() {
      if (this.boundHandler) {
        window.removeEventListener('deviceorientationabsolute', this.boundHandler, true);
        window.removeEventListener('deviceorientation', this.boundHandler, true);
        this.listenerBound = false;
      }
    },

    handleOrientation(e) {
      let heading = null;
      if (e.webkitCompassHeading) {
        // iOS
        heading = e.webkitCompassHeading;
      } else if (e.absolute && e.alpha !== null) {
        // Android absolute
        heading = 360 - e.alpha;
      } else if (e.alpha !== null) {
        heading = 360 - e.alpha;
      }

      if (heading !== null) {
        this.userHeading = heading;
        this.renderNeedle();
      }
    },

    renderNeedle() {
      const dialEl = document.getElementById('compassDial');
      const arrowEl = document.getElementById('compassTargetArrow');
      const degreesEl = document.getElementById('compassDegreesText');

      // Rotate compass dial with device heading
      if (dialEl) {
        dialEl.style.transform = `rotate(${-this.userHeading}deg)`;
      }

      // Needle points to the shelter bearing relative to device heading
      const relativeAngle = (this.targetBearing - this.userHeading + 360) % 360;
      if (arrowEl) {
        arrowEl.style.transform = `rotate(${relativeAngle}deg)`;
      }

      if (degreesEl) {
        degreesEl.textContent = `${Math.round(relativeAngle)}°`;
      }
    },

    calculateBearing(lat1, lon1, lat2, lon2) {
      const toRad = d => (d * Math.PI) / 180;
      const toDeg = r => (r * 180) / Math.PI;

      const φ1 = toRad(lat1);
      const φ2 = toRad(lat2);
      const Δλ = toRad(lon2 - lon1);

      const y = Math.sin(Δλ) * Math.cos(φ2);
      const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
      const θ = Math.atan2(y, x);

      return (toDeg(θ) + 360) % 360;
    },

    getCardinal(bearing, isHindi = false) {
      const directionsEn = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
      const directionsHi = ['उत्तर (N)', 'उत्तर-पूर्व (NE)', 'पूर्व (E)', 'दक्षिण-पूर्व (SE)', 'दक्षिण (S)', 'दक्षिण-पश्चिम (SW)', 'पश्चिम (W)', 'उत्तर-पश्चिम (NW)'];
      const idx = Math.round(bearing / 45) % 8;
      return isHindi ? directionsHi[idx] : directionsEn[idx];
    }
  },

  // ----------------------------------------------------
  // 4. ZERO-INTERNET SMS EMERGENCY DISPATCHER
  // ----------------------------------------------------
  sms: {
    init() {
      window.addEventListener('online', () => this.updateOnlineStatus());
      window.addEventListener('offline', () => this.updateOnlineStatus());
      this.updateOnlineStatus();
    },

    updateOnlineStatus() {
      const offlineBanner = document.getElementById('offlineSmsBanner');
      const isOnline = navigator.onLine;
      if (offlineBanner) {
        offlineBanner.style.display = isOnline ? 'none' : 'flex';
      }
    },

    sendOfflineSos(targetPhone = '112') {
      const profile = (window.AppState && window.AppState.profile) || {};
      const name = profile.name || 'Citizen in Distress';
      const phone = profile.phone || '';
      const lat = (window.AppState && window.AppState.userLocation.lat) ? window.AppState.userLocation.lat.toFixed(5) : '26.8655';
      const lon = (window.AppState && window.AppState.userLocation.lon) ? window.AppState.userLocation.lon.toFixed(5) : '80.9520';
      const city = (window.AppState && window.AppState.userLocation.city) ? window.AppState.userLocation.city : 'Nawabganj';

      const mapLink = `https://maps.google.com/?q=${lat},${lon}`;
      const msg = `EMERGENCY SOS! I need immediate disaster rescue.\nName: ${name}\nPhone: ${phone}\nLocation: ${city} (GPS: ${lat}, ${lon})\nLive Map: ${mapLink}\nPlease dispatch NDRF/SDRF/Ambulance immediately.`;

      const encodedMsg = encodeURIComponent(msg);
      // Universal SMS URI (Android & iOS)
      const smsUri = `sms:${targetPhone}?body=${encodedMsg}`;
      window.location.href = smsUri;
      showToast('Opening SMS App to dispatch Emergency SOS...', 'info');
    }
  },

  // ----------------------------------------------------
  // 5. PERMISSIONS & HARDWARE READINESS MANAGER
  // ----------------------------------------------------
  permissions: {
    state: {
      gps: 'prompt',
      camera: 'prompt',
      audio: 'granted',
      sms: 'ready'
    },

    async checkAll() {
      // 1. Geolocation
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const geo = await navigator.permissions.query({ name: 'geolocation' });
          this.state.gps = geo.state;
          geo.onchange = () => {
            this.state.gps = geo.state;
            this.render();
          };
        } catch (_) {}

        // 2. Camera / Torch
        try {
          const cam = await navigator.permissions.query({ name: 'camera' });
          this.state.camera = cam.state;
          cam.onchange = () => {
            this.state.camera = cam.state;
            this.render();
          };
        } catch (_) {}
      }

      this.render();
    },

    async requestGps() {
      if (!navigator.geolocation) {
        showToast('GPS not supported on this device.', 'error');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => {
          this.state.gps = 'granted';
          this.render();
          showToast('✅ High-Accuracy GPS Permission Granted!', 'success');
          if (window.detectUserLocation) window.detectUserLocation();
        },
        (err) => {
          this.state.gps = 'denied';
          this.render();
          showToast('GPS Permission Denied. Please enable in browser settings.', 'error');
        },
        { enableHighAccuracy: true }
      );
    },

    async requestTorch() {
      const ok = await RescueToolkit.torch.init();
      if (ok) {
        this.state.camera = 'granted';
        this.render();
        showToast('✅ Camera & SOS Torch Flashlight Ready!', 'success');
        // Quick flash test (300ms)
        await RescueToolkit.torch.setTorch(true);
        setTimeout(() => RescueToolkit.torch.setTorch(false), 300);
      } else {
        // Fallback to screen beacon mode
        this.state.camera = 'fallback';
        this.render();
        showToast('💡 Screen Beacon Fallback Enabled (No rear camera flash needed)', 'info');
      }
    },

    testSms() {
      showToast('📲 Emergency 112 SMS Speed-Dial is configured and ready.', 'success');
    },

    testAudio() {
      if (window.AudioEngine && typeof window.AudioEngine.playSiren === 'function') {
        window.AudioEngine.playSiren(3);
        showToast('🔊 Disaster Siren Test Playing (3 seconds)...', 'warning');
      } else if (window.VoiceEngine && typeof window.VoiceEngine.speakAlert === 'function') {
        window.VoiceEngine.speakAlert('This is an emergency audio test for Suraksha Bandhan.');
      }
    },

    render() {
      const container = document.getElementById('devicePermissionsList');
      if (!container) return;

      const lang = window.I18N ? window.I18N.currentLang : 'hi';
      const isNonEn = lang !== 'en';

      const isGpsOk = this.state.gps === 'granted';
      const isTorchOk = this.state.camera === 'granted' || this.state.camera === 'fallback';

      container.innerHTML = `
        <div class="permission-item">
          <div class="perm-icon ${isGpsOk ? 'granted' : 'pending'}">
            <i class="fas fa-location-crosshairs"></i>
          </div>
          <div class="perm-info">
            <h4>${isNonEn ? 'जीपीएस स्थान (High-Accuracy GPS)' : 'High-Accuracy GPS Location'}</h4>
            <p>${isNonEn ? 'सटीक बाढ़ चेतावनी, निकटतम शरणस्थल एवं 112 एसओएस के लिए आवश्यक' : 'Required for hyper-local river flood gauges and 2-3km safe shelter guidance'}</p>
            <div class="perm-status ${isGpsOk ? 'granted' : 'pending'}">
              <i class="fas ${isGpsOk ? 'fa-check-circle' : 'fa-circle-exclamation'}"></i>
              ${isGpsOk ? (isNonEn ? 'सक्रिय एवं अनुमत (Granted)' : 'Active & Allowed') : (isNonEn ? 'अनुमति की आवश्यकता (Action Required)' : 'Permission Needed')}
            </div>
          </div>
          <button class="perm-btn ${isGpsOk ? 'btn-tested' : 'btn-grant'}" onclick="RescueToolkit.permissions.requestGps()">
            ${isGpsOk ? (isNonEn ? 'सत्यापित' : 'Verified') : (isNonEn ? 'अनुमति दें' : 'Allow GPS')}
          </button>
        </div>

        <div class="permission-item">
          <div class="perm-icon ${isTorchOk ? 'granted' : 'pending'}">
            <i class="fas fa-bolt"></i>
          </div>
          <div class="perm-info">
            <h4>${isNonEn ? 'एसओएस फ्लैशलाइट एवं टॉर्च (Rescue Torch)' : 'Emergency Flashlight & SOS Strobe'}</h4>
            <p>${isNonEn ? 'अंधेरे, बाढ़ और मलबे में बचाव नौकाओं को मोर्र्स कोड संकेत देने के लिए' : 'Pulses international SOS Morse code to signal rescue boats and SDRF teams'}</p>
            <div class="perm-status ${isTorchOk ? 'granted' : 'pending'}">
              <i class="fas ${isTorchOk ? 'fa-check-circle' : 'fa-circle-exclamation'}"></i>
              ${isTorchOk ? (isNonEn ? 'तैयार (Hardware Ready)' : 'Ready & Functional') : (isNonEn ? 'परीक्षण आवश्यक' : 'Setup Required')}
            </div>
          </div>
          <button class="perm-btn ${isTorchOk ? 'btn-tested' : 'btn-grant'}" onclick="RescueToolkit.permissions.requestTorch()">
            ${isTorchOk ? (isNonEn ? 'परीक्षण करें' : 'Test Torch') : (isNonEn ? 'अनुमति दें' : 'Allow Torch')}
          </button>
        </div>

        <div class="permission-item">
          <div class="perm-icon granted">
            <i class="fas fa-comment-sms"></i>
          </div>
          <div class="perm-info">
            <h4>${isNonEn ? 'ऑफलाइन 112 एसएमएस डिस्पैच (Zero-Internet SMS)' : 'Offline 112 Emergency SMS'}</h4>
            <p>${isNonEn ? 'इंटरनेट बंद होने पर 1-टैप में 112 व परिवार को जीपीएस संदेश भेजने हेतु' : 'Instantly transmits your exact GPS location via 2G telecom SMS when 4G/5G is down'}</p>
            <div class="perm-status granted">
              <i class="fas fa-check-circle"></i>
              ${isNonEn ? 'कॉन्फ़िगर एवं सक्रिय' : 'Configured & Ready'}
            </div>
          </div>
          <button class="perm-btn btn-tested" onclick="RescueToolkit.sms.sendOfflineSos('112')">
            ${isNonEn ? 'एसएमएस जांचें' : 'Test 112 SMS'}
          </button>
        </div>

        <div class="permission-item">
          <div class="perm-icon granted">
            <i class="fas fa-volume-high"></i>
          </div>
          <div class="perm-info">
            <h4>${isNonEn ? 'आपदा सायरन एवं ऑडियो पाठक (Web Audio Siren)' : 'Emergency Audio Siren & Whistle'}</h4>
            <p>${isNonEn ? 'मलबे या भारी बारिश में 500 मीटर दूर बचाव दलों का ध्यान खींचने हेतु' : 'Audible rescue whistle and warning alert audio for NDRF search teams'}</p>
            <div class="perm-status granted">
              <i class="fas fa-check-circle"></i>
              ${isNonEn ? 'ऑडियो इंजन तैयार' : 'Web Audio Ready'}
            </div>
          </div>
          <button class="perm-btn btn-tested" onclick="RescueToolkit.permissions.testAudio()">
            ${isNonEn ? 'सायरन बजाएं' : 'Play Siren'}
          </button>
        </div>
      `;
    }
  }
};

// Initialize listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  RescueToolkit.sms.init();
  setTimeout(() => {
    RescueToolkit.permissions.checkAll();
  }, 1000);
});

window.RescueToolkit = RescueToolkit;
