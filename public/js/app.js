// Main Application Controller for Suraksha Bandhan v3.0
const AppState = {
  userLocation: {
    lat: 26.4499,
    lon: 80.3319,
    city: 'Kanpur',
    state: 'Uttar Pradesh'
  },
  alerts: [],
  closestRiver: null,
  hospitals: [],
  shelters: [],
  helplines: [],
  guides: [],
  communityReports: [],
  safetyCheckins: [],
  userProfile: null,
  ws: null,
  wsConnected: false,
  accessibility: {
    highContrast: false,
    fontSize: 'normal' // normal, large, xlarge
  }
};

window.AppState = AppState;

// ============================================
// WEBSOCKET REAL-TIME SYNC
// ============================================
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      AppState.wsConnected = true;
      console.log('📡 Connected to Suraksha Bandhan Live Emergency Network');
      updateConnectionStatus(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleLiveEvent(msg);
      } catch (e) {
        console.warn('WS message error:', e);
      }
    };

    ws.onclose = () => {
      AppState.wsConnected = false;
      updateConnectionStatus(false);
      // Reconnect after 4s
      setTimeout(initWebSocket, 4000);
    };

    ws.onerror = () => {
      AppState.wsConnected = false;
      updateConnectionStatus(false);
    };

    AppState.ws = ws;
  } catch (err) {
    console.warn('WebSocket init error:', err);
  }
}

function updateConnectionStatus(isOnline) {
  const badge = document.getElementById('networkLiveBadge');
  if (badge) {
    if (isOnline) {
      badge.innerHTML = `<span class="live-dot green"></span> Live Server Sync`;
      badge.className = 'live-status-pill online';
    } else {
      badge.innerHTML = `<span class="live-dot orange"></span> Offline Cache Mode`;
      badge.className = 'live-status-pill offline';
    }
  }
}

function handleLiveEvent(msg) {
  switch (msg.type) {
    case 'NEW_ALERT':
      showToast(`🚨 NEW EMERGENCY ALERT: ${msg.payload.title}`, 'error');
      if (window.VoiceEngine) window.VoiceEngine.playChime();
      fetchAlerts();
      break;
    case 'EMERGENCY_SOS':
      showToast(`🆘 SOS DISTRESS SIGNAL received from ${msg.payload.name} (${msg.payload.location.city})`, 'error');
      if (window.VoiceEngine) window.VoiceEngine.playChime();
      break;
    case 'NEW_HAZARD_REPORT':
      showToast(`⚠️ Hazard Reported: ${msg.payload.type} at ${msg.payload.address}`, 'warning');
      fetchHazardReports();
      break;
    case 'NEW_SAFETY_CHECKIN':
      fetchSafetyCheckins();
      break;
  }
}

// ============================================
// GEOLOCATION & WEATHER
// ============================================
function detectUserLocation() {
  const locationEl = document.getElementById('locationText');
  const locateBtn = document.getElementById('locateBtn');

  if (locateBtn) locateBtn.classList.add('loading');
  if (locationEl) locationEl.textContent = window.I18N ? window.I18N.get('locationDetecting') : 'Detecting location...';

  if (!navigator.geolocation) {
    showToast('Geolocation not supported, using default region.', 'info');
    onLocationReady(26.4499, 80.3319, 'Kanpur');
    if (locateBtn) locateBtn.classList.remove('loading');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      let cityName = 'Current Location';

      try {
        const rev = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        if (rev.ok) {
          const rData = await rev.json();
          cityName = rData.locality || rData.city || rData.principalSubdivision || 'Detected Location';
        }
      } catch (_) {}

      onLocationReady(lat, lon, cityName);
      if (locateBtn) locateBtn.classList.remove('loading');
    },
    (err) => {
      console.warn('Geolocation failed or blocked:', err.message);
      const saved = localStorage.getItem('suraksha_chosen_city');
      let fallbackName = 'Kanpur (कानपुर)', fLat = 26.4499, fLon = 80.3319;
      if (saved) {
        try {
          const s = JSON.parse(saved);
          fallbackName = s.name; fLat = s.lat; fLon = s.lon;
        } catch (_) {}
      }
      onLocationReady(fLat, fLon, fallbackName);
      if (locateBtn) locateBtn.classList.remove('loading');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function onLocationReady(lat, lon, cityName) {
  AppState.userLocation.lat = lat;
  AppState.userLocation.lon = lon;
  AppState.userLocation.city = cityName;

  const locationEl = document.getElementById('locationText');
  if (locationEl) {
    locationEl.textContent = window.I18N ? window.I18N.localizeLocation(cityName) : cityName;
  }

  const sosCoordsEl = document.getElementById('sosGpsCoords');
  if (sosCoordsEl) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    sosCoordsEl.textContent = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
  }

  // Refresh all location-dependent feeds
  fetchWeather(lat, lon);
  fetchAQI(lat, lon);
  fetchAlerts();
  fetchRiverMonitor();
  fetchNearbyHospitals();
  fetchNearbyShelters();

  if (window.MapController && window.MapController.map) {
    window.MapController.updateUserLocation();
  }

  // Pre-load audio summary so it plays with 0ms delay when user taps
  setTimeout(() => {
    if (window.VoiceEngine && typeof window.VoiceEngine.preloadSafetySummary === 'function') {
      window.VoiceEngine.preloadSafetySummary();
    }
  }, 1000);
}

// Weather from backend proxy
async function fetchWeather(lat, lon) {
  const tempEl = document.getElementById('weatherTemp');
  const feelsEl = document.getElementById('weatherFeels');
  const descEl = document.getElementById('weatherDesc');
  const humEl = document.getElementById('weatherHumidity');
  const windEl = document.getElementById('weatherWind');
  const iconEl = document.getElementById('weatherIcon');

  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    const json = await res.json();
    if (json.data && json.data.current) {
      const cur = json.data.current;
      const t = Math.round(cur.temperature_2m);
      const appT = Math.round(cur.apparent_temperature);
      const hum = cur.relative_humidity_2m;
      const windKmh = Math.round(cur.wind_speed_10m);
      const wCode = cur.weather_code;

      if (tempEl) tempEl.innerHTML = `${t}<span>&deg;C</span>`;
      if (feelsEl) feelsEl.textContent = `${window.I18N ? window.I18N.get('feelsLike') : 'Feels like'} ${appT}°C`;
      if (humEl) humEl.textContent = hum;
      if (windEl) windEl.textContent = windKmh;

      const weatherInfo = parseWeatherCode(wCode);
      if (descEl) descEl.textContent = weatherInfo.desc;
      if (iconEl) iconEl.className = `fas ${weatherInfo.icon} weather-icon-large`;

      updateAtmosphericRiskBanner(t, wCode, windKmh);
    }
  } catch (err) {
    console.warn('Weather error:', err);
  }
}

function parseWeatherCode(code) {
  const lang = window.I18N ? window.I18N.currentLang : 'hi';
  const isNonEn = lang !== 'en';

  if (code === 0) return { desc: isNonEn ? 'साफ आसमान (Clear Sky)' : 'Clear Sky', icon: 'fa-sun' };
  if (code <= 3) return { desc: isNonEn ? 'आंशिक बादल (Partly Cloudy)' : 'Partly Cloudy', icon: 'fa-cloud-sun' };
  if (code <= 48) return { desc: isNonEn ? 'कोहरा / धुंध (Fog / Mist)' : 'Fog / Mist', icon: 'fa-smog' };
  if (code <= 55) return { desc: isNonEn ? 'हल्की बूंदाबांदी (Drizzle)' : 'Drizzle', icon: 'fa-cloud-rain' };
  if (code <= 65) return { desc: isNonEn ? 'बारिश / बौछारें (Rain Showers)' : 'Rain Showers', icon: 'fa-cloud-showers-heavy' };
  if (code <= 75) return { desc: isNonEn ? 'बर्फबारी (Snowfall)' : 'Snowfall', icon: 'fa-snowflake' };
  if (code <= 82) return { desc: isNonEn ? 'मूसलाधार बारिश (Heavy Rainstorm)' : 'Heavy Rainstorm', icon: 'fa-cloud-showers-water' };
  if (code <= 99) return { desc: isNonEn ? 'तूफान एवं आकाशीय बिजली (Thunderstorm)' : 'Thunderstorm & Lightning', icon: 'fa-bolt' };
  return { desc: isNonEn ? 'घने बादल (Overcast)' : 'Overcast', icon: 'fa-cloud' };
}

// AQI from backend proxy
async function fetchAQI(lat, lon) {
  const widget = document.getElementById('aqiWidget');
  const valEl = document.getElementById('aqiValue');
  const catEl = document.getElementById('aqiCategory');
  const fillEl = document.getElementById('aqiFill');
  const iconEl = document.getElementById('aqiIcon');

  try {
    const res = await fetch(`/api/aqi?lat=${lat}&lon=${lon}`);
    const json = await res.json();
    if (json.data && json.data.current) {
      const pm25 = json.data.current.pm2_5;
      const aqiUs = json.data.current.us_aqi || Math.round(pm25 * 3.5);

      let cat = 'Good', cls = 'aqi-good', pct = 20, icon = 'fa-leaf';
      if (aqiUs <= 50) {
        cat = 'Good'; cls = 'aqi-good'; pct = 20; icon = 'fa-leaf';
      } else if (aqiUs <= 100) {
        cat = 'Moderate'; cls = 'aqi-moderate'; pct = 40; icon = 'fa-smile';
      } else if (aqiUs <= 200) {
        cat = 'Poor (Unhealthy)'; cls = 'aqi-unhealthy'; pct = 70; icon = 'fa-mask-face';
      } else if (aqiUs <= 300) {
        cat = 'Very Poor'; cls = 'aqi-unhealthy'; pct = 85; icon = 'fa-lungs';
      } else {
        cat = 'Severe / Hazardous'; cls = 'aqi-hazardous'; pct = 100; icon = 'fa-skull-crossbones';
      }

      if (valEl) valEl.textContent = `AQI ${aqiUs} (PM2.5: ${pm25 ? pm25.toFixed(1) : '--'})`;
      if (catEl) catEl.textContent = cat;
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (iconEl) iconEl.className = `fas ${icon} aqi-icon`;
      if (widget) {
        widget.className = `aqi-widget ${cls}`;
        widget.style.display = 'flex';
      }
    }
  } catch (err) {
    console.warn('AQI error:', err);
  }
}

function updateAtmosphericRiskBanner(temp, code, wind) {
  let level = 'safe';
  let titleKey = 'statusSafe';
  let iconClass = 'fas fa-shield-check';

  if (code >= 95 || code >= 65 || temp >= 42) {
    level = 'danger';
    titleKey = 'statusDanger';
    iconClass = (code >= 95) ? 'fas fa-bolt' : (code >= 65 ? 'fas fa-cloud-showers-water' : 'fas fa-temperature-arrow-up');
  } else if (code >= 51) {
    level = 'warning';
    titleKey = 'statusWarning';
    iconClass = 'fas fa-cloud-rain';
  }

  AppState.atmosphericState = { level, titleKey, iconClass };
  renderAtmosphericRiskBanner();
}

function renderAtmosphericRiskBanner() {
  const banner = document.getElementById('statusBanner');
  if (!banner) return;

  const state = AppState.atmosphericState || { level: 'safe', titleKey: 'statusSafe', iconClass: 'fas fa-shield-check' };
  const title = banner.querySelector('.status-title');
  const icon = banner.querySelector('.status-icon i');

  banner.className = `status-banner ${state.level}`;
  if (title) {
    title.textContent = window.I18N ? window.I18N.get(state.titleKey) : 'All Clear - Normal Atmospheric Conditions';
  }
  if (icon) {
    icon.className = state.iconClass;
  }
}
window.renderAtmosphericRiskBanner = renderAtmosphericRiskBanner;

// ============================================
// DATA FETCHERS
// ============================================

// 1. Disaster Alerts
async function fetchAlerts(filterSeverity = 'all') {
  const container = document.getElementById('alertsContainer');
  const allAlertsContainer = document.getElementById('allAlertsContainer');
  const lat = AppState.userLocation.lat;
  const lon = AppState.userLocation.lon;

  try {
    const res = await fetch(`/api/alerts?lat=${lat}&lon=${lon}&severity=${filterSeverity}`);
    const data = await res.json();
    AppState.alerts = data.alerts || [];

    updateAlertStats(AppState.alerts);
    renderAlertCards(AppState.alerts, container, 3);
    if (allAlertsContainer) {
      renderAlertCards(AppState.alerts, allAlertsContainer, 20);
    }
  } catch (err) {
    console.warn('Alerts fetch error:', err);
  }
}

function updateAlertStats(alerts) {
  const total = alerts.length;
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const high = alerts.filter(a => a.severity === 'high').length;
  const medium = alerts.filter(a => a.severity === 'medium').length;

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setEl('statTotal', total);
  setEl('statCritical', critical);
  setEl('statHigh', high);
  setEl('statMedium', medium);
}

function renderAlertCards(alerts, container, limit = 10) {
  if (!container) return;
  const lang = window.I18N ? window.I18N.currentLang : 'hi';
  const isNonEn = lang !== 'en';

  if (!alerts || alerts.length === 0) {
    const noAlerts = isNonEn ? 'आपके क्षेत्र में कोई आपदा चेतावनी सक्रिय नहीं है।' : 'No active alerts matching your selection.';
    container.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text2);">
        <i class="fas fa-circle-check" style="font-size:36px;color:var(--success);margin-bottom:8px;display:block;"></i>
        <p>${noAlerts}</p>
      </div>
    `;
    return;
  }

  const categoryIcons = {
    flood: 'fa-water',
    storm: 'fa-bolt',
    cyclone: 'fa-wind',
    landslide: 'fa-mountain',
    heat: 'fa-temperature-high',
    aqi: 'fa-lungs',
    general: 'fa-triangle-exclamation'
  };

  const listenLabel = window.I18N ? window.I18N.get('speechReadAlert') : 'Listen';
  const safeZonesLabel = window.I18N ? window.I18N.get('mapSafeShelters') : 'Safe Zones';
  const distUnit = isNonEn ? 'किमी दूर' : 'km away';
  const callLabel = isNonEn ? 'कॉल करें' : 'Call';

  const cardsHtml = alerts.slice(0, limit).map(a => {
    const icon = categoryIcons[a.category] || 'fa-bell';
    const title = (isNonEn && (a['title_' + lang] || a.title_hi)) ? (a['title_' + lang] || a.title_hi) : a.title;
    const desc = (isNonEn && (a['description_' + lang] || a.description_hi)) ? (a['description_' + lang] || a.description_hi) : a.description;
    const distText = a.distanceKm !== null ? `${a.distanceKm} ${distUnit}` : (window.I18N ? window.I18N.localizeLocation(a.location || 'Regional') : (a.location || 'Regional'));
    const colorCodeClass = a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'high' : 'medium';

    return `
      <div class="alert-card ${colorCodeClass}" data-alert-id="${a.id}">
        <div class="alert-icon-box">
          <i class="fas ${icon}"></i>
        </div>
        <div class="alert-content">
          <div class="alert-header-row">
            <h4>${escapeHtml(title)}</h4>
            <span class="severity-pill ${colorCodeClass}">${a.colorCode || a.severity.toUpperCase()}</span>
          </div>
          <p class="alert-desc">${escapeHtml(desc)}</p>
          <div class="alert-meta-bar">
            <span><i class="fas fa-building-columns"></i> ${a.source || 'NDMA / IMD'}</span>
            <span><i class="fas fa-location-dot"></i> ${distText}</span>
            <span><i class="fas fa-clock"></i> ${new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="alert-action-btns">
            <button class="alert-btn speak-btn" onclick="VoiceEngine.speak('${escapeJs(title)}. ${escapeJs(desc)}', '${window.I18N ? window.I18N.currentLang : 'en'}')">
              <i class="fas fa-volume-high"></i> ${listenLabel}
            </button>
            <button class="alert-btn map-btn" onclick="switchPage('map')">
              <i class="fas fa-map-location-dot"></i> ${safeZonesLabel}
            </button>
            <a href="tel:${a.emergencyContact || '112'}" class="alert-btn call-btn">
              <i class="fas fa-phone"></i> ${callLabel} ${a.emergencyContact || '112'}
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = cardsHtml;
}

// 2. River & Water Level Monitor
async function fetchRiverMonitor() {
  const card = document.getElementById('riverInfoCard');
  const nameEl = document.getElementById('riverName');
  const descEl = document.getElementById('riverDesc');
  const distEl = document.getElementById('riverDistance');
  const riskEl = document.getElementById('riverRisk');
  const updateEl = document.getElementById('riverUpdated');
  const gaugeFill = document.getElementById('riverGaugeFill');
  const gaugeCurrent = document.getElementById('riverGaugeCurrent');
  const gaugeDanger = document.getElementById('riverGaugeDanger');
  const gaugePct = document.getElementById('riverGaugePct');

  const lat = AppState.userLocation.lat;
  const lon = AppState.userLocation.lon;

  try {
    const res = await fetch(`/api/rivers/nearby?lat=${lat}&lon=${lon}`);
    const data = await res.json();
    if (data.closestStation) {
      const r = data.closestStation;
      AppState.closestRiver = r;

      const lang = window.I18N ? window.I18N.currentLang : 'hi';
      const isNonEn = lang !== 'en';
      const rRiver = (isNonEn && r.river_hi) ? r.river_hi : r.river;
      const rStation = (isNonEn && r.station_hi) ? r.station_hi : r.station;
      const rMsg = (isNonEn && r.alertMessage_hi) ? r.alertMessage_hi : r.alertMessage;

      if (nameEl) nameEl.textContent = `${rRiver} - ${rStation}`;
      if (descEl) descEl.textContent = rMsg;
      if (distEl) {
        if (r.distanceKm > 30) {
          distEl.textContent = `${r.distanceKm} km (${isNonEn ? 'क्षेत्रीय स्टेशन' : 'Regional Station'})`;
        } else {
          distEl.textContent = `${r.distanceKm} km`;
        }
      }

      let riskBadge = '🟢 ' + (window.I18N ? window.I18N.get('riverNormal') : 'Normal Flow');
      if (r.status === 'critical') riskBadge = '🔴 ' + (window.I18N ? window.I18N.get('riverCritical') : 'CRITICAL');
      else if (r.status === 'warning') riskBadge = '🟡 ' + (window.I18N ? window.I18N.get('riverWarning') : 'Warning Level');
      if (riskEl) riskEl.textContent = riskBadge;

      if (gaugeCurrent) gaugeCurrent.textContent = `${r.currentLevel} m`;
      if (gaugeDanger) gaugeDanger.textContent = `${r.dangerLevel} m`;

      // Gauge progress bar calculation
      const pct = Math.min(100, Math.max(10, Math.round((r.currentLevel / r.dangerLevel) * 100)));
      if (gaugeFill) {
        gaugeFill.style.width = `${pct}%`;
        if (r.status === 'critical') {
          gaugeFill.style.background = '#e74c3c';
        } else if (r.status === 'warning') {
          gaugeFill.style.background = '#f39c12';
        } else {
          gaugeFill.style.background = '#2ecc71';
        }
      }
      const trendLabel = isNonEn ? (r.trend === 'Rising' ? 'बढ़ रहा है' : r.trend === 'Falling' ? 'घट रहा है' : 'स्थिर') : r.trend;
      if (gaugePct) gaugePct.textContent = `${pct}% of Danger Mark (${trendLabel})`;

      if (updateEl) updateEl.textContent = new Date(r.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (card) card.style.display = 'block';
    }
  } catch (err) {
    console.warn('River fetch error:', err);
  }
}

// ============================================
// POPULAR INDIAN CITIES SELECTOR
// ============================================
const INDIAN_CITIES = [
  { name: 'Kanpur (कानपुर)', state: 'Uttar Pradesh', lat: 26.4499, lon: 80.3319 },
  { name: 'Lucknow (लखनऊ)', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  { name: 'New Delhi (नई दिल्ली)', state: 'Delhi NCR', lat: 28.6139, lon: 77.2090 },
  { name: 'Mumbai (मुंबई)', state: 'Maharashtra', lat: 19.0760, lon: 72.8777 },
  { name: 'Kolkata (कोलकाता)', state: 'West Bengal', lat: 22.5726, lon: 88.3639 },
  { name: 'Patna (पटना)', state: 'Bihar', lat: 25.5941, lon: 85.1376 },
  { name: 'Varanasi (वाराणसी)', state: 'Uttar Pradesh', lat: 25.3176, lon: 82.9739 },
  { name: 'Prayagraj (प्रयागराज)', state: 'Uttar Pradesh', lat: 25.4358, lon: 81.8463 },
  { name: 'Bengaluru (बेंगलुरु)', state: 'Karnataka', lat: 12.9716, lon: 77.5946 },
  { name: 'Chennai (चेन्नई)', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707 },
  { name: 'Hyderabad (हैदराबाद)', state: 'Telangana', lat: 17.3850, lon: 78.4867 },
  { name: 'Guwahati (गुवाहाटी)', state: 'Assam', lat: 26.1445, lon: 91.7362 },
  { name: 'Bhubaneswar (भुवनेश्वर)', state: 'Odisha', lat: 20.2961, lon: 85.8245 },
  { name: 'Dehradun (देहरादून)', state: 'Uttarakhand', lat: 30.3165, lon: 78.0322 },
  { name: 'Shimla (शिमला)', state: 'Himachal Pradesh', lat: 31.1048, lon: 77.1734 },
  { name: 'Jaipur (जयपुर)', state: 'Rajasthan', lat: 26.9124, lon: 75.7873 },
  { name: 'Ahmedabad (अहमदाबाद)', state: 'Gujarat', lat: 23.0225, lon: 72.5714 },
  { name: 'Kochi (कोच्चि)', state: 'Kerala', lat: 9.9312, lon: 76.2673 }
];

function openCityPickerModal() {
  const isHindi = window.I18N && window.I18N.currentLang === 'hi';
  const modalTitle = isHindi ? 'अपना शहर या क्षेत्र चुनें' : 'Choose Your City / Region';
  const modalDesc = isHindi 
    ? 'अपने क्षेत्र के नदी जलस्तर, बाढ़ चेतावनी, अस्पताल और राहत शिविर देखने के लिए शहर चुनें:' 
    : 'Select your city to get instant local river water level, flood warnings, hospitals, and shelters:';
  const searchPlaceholder = isHindi ? '🔍 शहर का नाम खोजें...' : '🔍 Type city name...';

  const html = `
    <div style="margin-bottom:12px;">
      <p style="font-size:13px;color:var(--text2);margin-bottom:10px;">
        ${modalDesc}
      </p>
      <input type="text" id="citySearchInput" onkeyup="filterCityList()" placeholder="${searchPlaceholder}" style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg2);color:var(--text);margin-bottom:14px;font-size:14px;">
      <div class="city-picker-grid" id="cityPickerList">
        ${INDIAN_CITIES.map((c, i) => `
          <button class="city-picker-btn" onclick="selectCity(${i})">
            <span><i class="fas fa-location-dot" style="color:var(--primary);margin-right:4px;"></i> ${c.name}</span>
            <small>${c.state}</small>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  openGenericModal(modalTitle, html);
}

function filterCityList() {
  const q = (document.getElementById('citySearchInput').value || '').toLowerCase();
  const btns = document.querySelectorAll('#cityPickerList .city-picker-btn');
  btns.forEach((btn, i) => {
    const c = INDIAN_CITIES[i];
    const match = c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q);
    btn.style.display = match ? 'flex' : 'none';
  });
}

function selectCity(idx) {
  const c = INDIAN_CITIES[idx];
  if (!c) return;
  localStorage.setItem('suraksha_chosen_city', JSON.stringify(c));
  onLocationReady(c.lat, c.lon, c.name);
  closeGenericModal();
  showToast(`Location set to: ${c.name}`, 'success');
}

window.openCityPickerModal = openCityPickerModal;
window.selectCity = selectCity;
window.filterCityList = filterCityList;
window.renderAlertCards = renderAlertCards;

// 3. Nearby Hospitals
async function fetchNearbyHospitals() {
  const lat = AppState.userLocation.lat;
  const lon = AppState.userLocation.lon;
  const city = AppState.userLocation.city || '';
  try {
    const res = await fetch(`/api/hospitals/nearby?lat=${lat}&lon=${lon}&city=${encodeURIComponent(city)}`);
    const data = await res.json();
    AppState.hospitals = data.hospitals || [];
    renderHospitalsModalContent();
  } catch (err) {
    console.warn('Hospitals fetch error:', err);
  }
}

function renderHospitalsModalContent() {
  const hospitals = AppState.hospitals;
  if (!hospitals.length) return;
  const lang = window.I18N ? window.I18N.currentLang : 'hi';
  const isNonEn = lang !== 'en';
  const distUnit = isNonEn ? 'किमी' : 'km';
  const emerLabel = isNonEn ? '24x7 आपातकालीन' : '24x7 Emergency';
  const bloodLabel = isNonEn ? 'ब्लड बैंक' : 'Blood Bank';

  let html = '<div class="hospitals-modal-list">';
  hospitals.slice(0, 10).forEach(h => {
    const hName = (isNonEn && h.name_hi) ? h.name_hi : (window.I18N ? window.I18N.localizeLocation(h.name) : h.name);
    const hAddr = (isNonEn && h.address_hi) ? h.address_hi : (window.I18N ? window.I18N.localizeLocation(h.address || h.city) : (h.address || h.city));
    html += `
      <div class="hospital-card-item">
        <div class="hosp-icon"><i class="fas fa-hospital"></i></div>
        <div class="hosp-info">
          <h4>${escapeHtml(hName)}</h4>
          <p><i class="fas fa-map-pin"></i> ${escapeHtml(hAddr)}</p>
          <div class="hosp-pills">
            <span class="hosp-pill emergency">${emerLabel}</span>
            ${h.bloodBank ? `<span class="hosp-pill blood">${bloodLabel}</span>` : ''}
            <span class="hosp-pill distance">${h.distanceKm} ${distUnit}</span>
          </div>
        </div>
        <div class="hosp-actions">
          <a href="tel:${h.emergencyPhone || '108'}" class="hosp-action-btn call"><i class="fas fa-phone"></i></a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}" target="_blank" class="hosp-action-btn dir"><i class="fas fa-directions"></i></a>
        </div>
      </div>
    `;
  });
  html += '</div>';
  window.HospitalsModalHTML = html;
}

// 4. Nearby Shelters (Strictly 2-3 km safe radius)
async function fetchNearbyShelters() {
  const lat = AppState.userLocation.lat;
  const lon = AppState.userLocation.lon;
  const city = AppState.userLocation.city || '';
  try {
    const res = await fetch(`/api/shelters/nearby?lat=${lat}&lon=${lon}&radius=3&city=${encodeURIComponent(city)}`);
    const data = await res.json();
    // Strictly filter out any shelter beyond 3.0 km
    AppState.shelters = (data.shelters || []).filter(s => s.distanceKm <= 3.0);
    renderSheltersList();
  } catch (err) {
    console.warn('Shelters fetch error:', err);
  }
}

function renderSheltersList() {
  const container = document.getElementById('nearbyFacilitiesList');
  if (!container) return;
  const shelters = (AppState.shelters || []).filter(s => s.distanceKm <= 3.0);

  const lang = window.I18N ? window.I18N.currentLang : 'hi';
  const isNonEn = lang !== 'en';
  const capLabel = window.I18N ? window.I18N.get('mapCapacity') : 'Capacity';
  const personsLabel = isNonEn ? 'व्यक्ति' : 'persons';
  const distUnit = isNonEn ? 'किमी' : 'km';
  const highGroundBadge = isNonEn ? 'बाढ़-सुरक्षित उच्च स्थल' : 'Flood-Safe High Ground';

  if (!shelters.length) {
    const noSheltersMsg = isNonEn 
      ? 'आपके 2-3 किमी के दायरे में कोई सुरक्षित शरणस्थल उपलब्ध नहीं है। तुरंत निकटतम ऊंचे पक्के भवन / स्कूल में शरण लें अथवा 112 डायल करें।' 
      : 'No safe shelters detected within 2-3 km. Immediately move to the nearest high-ground pucca building / concrete roof or dial 112.';
    container.innerHTML = `
      <div style="padding:16px;text-align:center;background:rgba(231,76,60,0.08);border-radius:12px;margin:8px 0;border:1px dashed var(--danger);">
        <p style="color:var(--danger);font-weight:600;margin-bottom:8px;font-size:13px;"><i class="fas fa-exclamation-triangle"></i> ${noSheltersMsg}</p>
        <a href="tel:112" class="btn" style="display:inline-block;background:var(--danger);color:#fff;padding:6px 16px;border-radius:8px;font-size:13px;text-decoration:none;"><i class="fas fa-phone-alt"></i> Call 112</a>
      </div>
    `;
    return;
  }

  container.innerHTML = shelters.slice(0, 6).map(s => {
    const sName = (isNonEn && s.name_hi) ? s.name_hi : (window.I18N ? window.I18N.localizeLocation(s.name) : s.name);
    return `
      <div class="contact-card" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}','_blank')">
        <div class="contact-icon" style="color:var(--success);background:rgba(39,174,96,0.15);">
          <i class="fas fa-shield-heart"></i>
        </div>
        <div class="contact-info">
          <h4>${escapeHtml(sName)}</h4>
          <p>
            <i class="fas fa-users"></i> ${capLabel}: <strong>${s.capacity} ${personsLabel}</strong> &bull; 
            <span style="color:var(--success);font-weight:700;"><i class="fas fa-walking"></i> ${s.distanceKm} ${distUnit}</span>
            <span style="display:inline-block;margin-left:6px;font-size:11px;background:rgba(46,204,113,0.15);color:#27ae60;padding:2px 6px;border-radius:6px;font-weight:600;">
              <i class="fas fa-mountain"></i> ${highGroundBadge}
            </span>
          </p>
        </div>
        <button class="contact-call" style="background:var(--info);" title="${isNonEn ? 'गूगल मैप्स नेविगेशन' : 'Google Maps Navigation'}" onclick="event.stopPropagation();window.open('https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}','_blank')">
          <i class="fas fa-directions"></i>
        </button>
      </div>
    `;
  }).join('');
}
window.renderSheltersList = renderSheltersList;

// 5. Emergency Helplines
async function fetchHelplines() {
  const container = document.getElementById('helplinesContainer');
  try {
    if (!AppState.helplines || !AppState.helplines.length) {
      const res = await fetch('/api/helplines');
      const data = await res.json();
      AppState.helplines = data.helplines || [];
    }

    const isHindi = window.I18N && window.I18N.currentLang === 'hi';
    if (container) {
      container.innerHTML = AppState.helplines.map(h => `
        <div class="contact-card" onclick="window.location.href='tel:${h.number}'">
          <div class="contact-icon" style="color:${h.color};background:rgba(231,76,60,0.1);">
            <i class="fas ${h.icon}"></i>
          </div>
          <div class="contact-info">
            <h4>${isHindi && h.title_hi ? escapeHtml(h.title_hi) : escapeHtml(h.title)}</h4>
            <p>${escapeHtml(h.description)}</p>
          </div>
          <a href="tel:${h.number}" class="contact-call" style="background:${h.color};" onclick="event.stopPropagation();">
            <i class="fas fa-phone"></i>
          </a>
        </div>
      `).join('');
    }
  } catch (err) {
    console.warn('Helpline error:', err);
  }
}
window.fetchHelplines = fetchHelplines;

// 6. Citizen Hazard Reports
async function fetchHazardReports() {
  const listEl = document.getElementById('communityReportsList');
  try {
    const res = await fetch('/api/reports');
    const data = await res.json();
    AppState.communityReports = data.reports || [];

    if (listEl) {
      if (!AppState.communityReports.length) {
        const noReports = window.I18N ? window.I18N.get('commNoReports') : 'No community hazards reported yet. Tap below to report.';
        listEl.innerHTML = `<p style="padding:16px;text-align:center;color:var(--text2);">${noReports}</p>`;
        return;
      }
      const lang = window.I18N ? window.I18N.currentLang : 'hi';
      const isNonEn = lang !== 'en';

      listEl.innerHTML = AppState.communityReports.map(r => {
        const typeStr = window.I18N ? window.I18N.localizeHazardType(r.type) : r.type.toUpperCase();
        const addrStr = window.I18N ? window.I18N.localizeLocation(r.address || 'Near user') : (r.address || 'Near user');
        let repName = r.reporterName || 'Citizen';
        if (isNonEn && (repName === 'Citizen' || repName === 'Citizen Reporter' || repName === 'Local Citizen')) {
          repName = 'स्थानीय नागरिक (Citizen)';
        }
        return `
          <div class="hazard-report-item">
            <div class="hazard-badge-pill ${r.severity}">
              <i class="fas fa-triangle-exclamation"></i> ${escapeHtml(typeStr)}
            </div>
            <div class="hazard-body">
              <p class="hazard-desc">${escapeHtml(r.description)}</p>
              <div class="hazard-meta">
                <span><i class="fas fa-location-dot"></i> ${escapeHtml(addrStr)}</span>
                <span><i class="fas fa-user"></i> ${escapeHtml(repName)}</span>
                <span><i class="fas fa-clock"></i> ${new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('Hazard fetch error:', err);
  }
}
window.fetchHazardReports = fetchHazardReports;

// 7. Safety Check-Ins
async function fetchSafetyCheckins() {
  const listEl = document.getElementById('safetyCheckinsList');
  try {
    const res = await fetch('/api/safety-checkin');
    const data = await res.json();
    AppState.safetyCheckins = data.checkins || [];

    if (listEl) {
      if (!AppState.safetyCheckins.length) {
        const noCheckins = window.I18N ? window.I18N.get('commNoCheckins') : 'No check-ins yet. Tap "I Am Safe" to share status.';
        listEl.innerHTML = `<p style="padding:16px;text-align:center;color:var(--text2);">${noCheckins}</p>`;
        return;
      }
      const safeBadge = window.I18N ? window.I18N.get('commSafeBadge') : 'SAFE';
      listEl.innerHTML = AppState.safetyCheckins.map(c => {
        const rawCity = (c.location && c.location.city) || 'Safe Location';
        const cityStr = window.I18N ? window.I18N.localizeLocation(rawCity) : rawCity;
        return `
          <div class="checkin-item">
            <div class="checkin-avatar"><i class="fas fa-user-check"></i></div>
            <div class="checkin-info">
              <h4>${escapeHtml(c.name)} <span class="checkin-safe-pill">${safeBadge}</span></h4>
              <p>${escapeHtml(c.message)}</p>
              <small><i class="fas fa-location-dot"></i> ${escapeHtml(cityStr)} &bull; ${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('Checkins fetch error:', err);
  }
}
window.fetchSafetyCheckins = fetchSafetyCheckins;

// 8. User Profile & Cloud Sync
async function loadUserProfile() {
  try {
    // 1. Try local storage
    const cached = localStorage.getItem('suraksha_user_profile');
    if (cached) {
      AppState.userProfile = JSON.parse(cached);
    }
    // 2. Fetch from cloud
    const res = await fetch('/api/profile');
    const data = await res.json();
    if (data.profile) {
      AppState.userProfile = data.profile;
      localStorage.setItem('suraksha_user_profile', JSON.stringify(data.profile));
    }
    renderProfileView();
  } catch (err) {
    console.warn('Profile load error:', err);
  }
}

async function saveUserProfile(profileData) {
  try {
    AppState.userProfile = profileData;
    localStorage.setItem('suraksha_user_profile', JSON.stringify(profileData));

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    const result = await res.json();
    showToast('Profile synchronized to cloud database!', 'success');
    renderProfileView();
  } catch (err) {
    showToast('Saved locally in offline storage.', 'info');
    renderProfileView();
  }
}

function renderProfileView() {
  const p = AppState.userProfile || {};
  const nameEl = document.getElementById('profileDisplayName');
  const phoneEl = document.getElementById('profileDisplayPhone');
  const bloodEl = document.getElementById('profileDisplayBlood');
  const contactsContainer = document.getElementById('savedEmergencyContacts');

  const guestName = window.I18N ? window.I18N.get('profileGuestUser') : 'Guest Citizen';
  const noPhone = window.I18N ? window.I18N.get('profileNoPhone') : 'No phone set';
  const bloodLabel = window.I18N ? window.I18N.get('profileBloodLabel') : 'Blood Group';
  const bloodNotSet = window.I18N ? window.I18N.get('profileBloodNotSet') : 'Blood Group: Not Set';

  if (nameEl) nameEl.textContent = p.name || guestName;
  if (phoneEl) phoneEl.textContent = p.phone || noPhone;
  if (bloodEl) {
    bloodEl.textContent = (p.medicalInfo && p.medicalInfo.bloodGroup) 
      ? `${bloodLabel}: ${p.medicalInfo.bloodGroup}` 
      : bloodNotSet;
  }

  if (contactsContainer) {
    const list = p.emergencyContacts || [];
    if (!list.length) {
      const noContacts = window.I18N ? window.I18N.get('profileNoContactsHint') : 'No emergency contacts saved yet. Tap "Edit Profile" below.';
      contactsContainer.innerHTML = `<p style="padding:16px;text-align:center;color:var(--text2);">${noContacts}</p>`;
    } else {
      contactsContainer.innerHTML = list.map(c => `
        <div class="saved-contact-card">
          <div class="contact-icon" style="background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;">
            <i class="fas fa-user-shield"></i>
          </div>
          <div class="contact-info">
            <h4>${escapeHtml(c.name)}</h4>
            <p>${escapeHtml(c.phone)}</p>
          </div>
          <a href="tel:${c.phone}" class="contact-call"><i class="fas fa-phone"></i></a>
        </div>
      `).join('');
    }
  }
}
window.renderProfileView = renderProfileView;

// ============================================
// MODALS & NAVIGATION
// ============================================
function switchPage(pageId) {
  if (navigator.vibrate) {
    try { navigator.vibrate(15); } catch (_) {}
  }
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (pageId === 'map') {
    setTimeout(() => {
      if (window.MapController) window.MapController.init();
    }, 150);
  } else if (pageId === 'community') {
    fetchHazardReports();
    fetchSafetyCheckins();
  }
}

function openGenericModal(title, bodyHtml) {
  const modal = document.getElementById('genericModalOverlay');
  const titleEl = document.getElementById('genericModalTitle');
  const bodyEl = document.getElementById('genericModalBody');

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = bodyHtml;
  if (modal) modal.classList.add('active');
}

function closeGenericModal() {
  const modal = document.getElementById('genericModalOverlay');
  if (modal) modal.classList.remove('active');
}

window.openGenericModal = openGenericModal;
window.closeGenericModal = closeGenericModal;
window.switchPage = switchPage;

// Toast notification
let toastTimer = null;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('appToast');
  if (!toast) return;

  toast.textContent = msg;
  toast.className = `app-toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
window.showToast = showToast;

// ============================================
// ACCESSIBILITY & CONTRAST
// ============================================
function toggleHighContrast() {
  AppState.accessibility.highContrast = !AppState.accessibility.highContrast;
  document.body.classList.toggle('high-contrast-mode', AppState.accessibility.highContrast);
  showToast(AppState.accessibility.highContrast ? 'High Contrast Mode Enabled' : 'High Contrast Mode Disabled', 'info');
}

function updateFontSizeBadge(size) {
  const badge = document.getElementById('fontSizeBadge');
  const btn = document.getElementById('fontSizeBtn');
  if (!badge) return;
  if (size === 'large') {
    badge.innerHTML = 'A<sup style="font-size:9px;color:#f1c40f;font-weight:900;">+</sup>';
    if (btn) {
      btn.title = 'Current: Large Font (बड़ा आकार +15%) - Tap for Extra Large';
      btn.classList.add('active-font-scale');
    }
  } else if (size === 'xlarge') {
    badge.innerHTML = 'A<sup style="font-size:9px;color:#ff7675;font-weight:900;">++</sup>';
    if (btn) {
      btn.title = 'Current: Extra Large Font (अति बड़ा आकार +28%) - Tap for Normal';
      btn.classList.add('active-font-scale');
    }
  } else {
    badge.innerHTML = 'A';
    if (btn) {
      btn.title = 'Current: Normal Font (सामान्य आकार) - Tap to Enlarge';
      btn.classList.remove('active-font-scale');
    }
  }
}

function updateDarkToggleUI(isDark) {
  const icon = document.getElementById('darkToggleIcon');
  const btn = document.getElementById('darkToggle');
  if (icon) {
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    icon.style.color = isDark ? '#f1c40f' : '';
  }
  if (btn) {
    btn.title = isDark ? 'Switch to Light Mode (लाइट मोड)' : 'Switch to Dark Mode (डार्क मोड)';
  }
}

function cycleFontSize() {
  const sizes = ['normal', 'large', 'xlarge'];
  let currentIdx = sizes.indexOf(AppState.accessibility.fontSize);
  if (currentIdx === -1) currentIdx = 0;
  let nextIdx = (currentIdx + 1) % sizes.length;
  const nextSize = sizes[nextIdx];
  AppState.accessibility.fontSize = nextSize;

  const root = document.documentElement;
  const body = document.body;

  root.classList.remove('font-size-normal', 'font-size-large', 'font-size-xlarge');
  body.classList.remove('font-size-normal', 'font-size-large', 'font-size-xlarge');

  if (nextSize === 'large') {
    root.classList.add('font-size-large');
    body.classList.add('font-size-large');
  } else if (nextSize === 'xlarge') {
    root.classList.add('font-size-xlarge');
    body.classList.add('font-size-xlarge');
  } else {
    root.classList.add('font-size-normal');
    body.classList.add('font-size-normal');
  }

  updateFontSizeBadge(nextSize);
  localStorage.setItem('suraksha_font_size', nextSize);

  const isHindi = window.I18N && window.I18N.currentLang === 'hi';
  const labels = {
    normal: isHindi ? 'फॉन्ट आकार: सामान्य (100%)' : 'Font Size: Normal (100%)',
    large: isHindi ? 'फॉन्ट आकार: बड़ा (+15%)' : 'Font Size: Large (+15%)',
    xlarge: isHindi ? 'फॉन्ट आकार: अति बड़ा (+28%)' : 'Font Size: Extra Large (+28%)'
  };
  showToast(labels[nextSize] || 'Font Size Changed', 'info');
  if (navigator.vibrate) navigator.vibrate(25);
}
window.cycleFontSize = cycleFontSize;

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, ' ');
}

// ============================================
// APP INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing Suraksha Bandhan v3.0');

  // Restore Font Size preference
  const savedFontSize = localStorage.getItem('suraksha_font_size') || 'normal';
  AppState.accessibility.fontSize = savedFontSize;
  if (savedFontSize === 'large' || savedFontSize === 'xlarge') {
    document.documentElement.classList.add(`font-size-${savedFontSize}`);
    document.body.classList.add(`font-size-${savedFontSize}`);
  }
  updateFontSizeBadge(savedFontSize);

  // Bind Font Size button
  const fontBtn = document.getElementById('fontSizeBtn');
  if (fontBtn) {
    fontBtn.addEventListener('click', (e) => {
      e.preventDefault();
      cycleFontSize();
    });
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration error:', err));
  }

  // Initialize I18N
  if (window.I18N) window.I18N.init();

  // Dark Mode init
  const savedTheme = localStorage.getItem('suraksha_theme');
  const isDarkInitial = savedTheme === 'dark';
  if (isDarkInitial) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  updateDarkToggleUI(isDarkInitial);

  // Bind Dark Mode toggle
  const darkBtn = document.getElementById('darkToggle');
  if (darkBtn) {
    darkBtn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const newTheme = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('suraksha_theme', newTheme);
      updateDarkToggleUI(newTheme === 'dark');
      showToast(newTheme === 'dark' ? 'Dark Mode Active (डार्क मोड चालू)' : 'Light Mode Active (लाइट मोड चालू)', 'info');
      if (navigator.vibrate) navigator.vibrate(20);
    });
  }

  // Language Dropdown
  const langBtn = document.getElementById('langDropdownBtn');
  const langMenu = document.getElementById('langDropdownMenu');
  if (langBtn && langMenu) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langMenu.classList.toggle('active');
    });
    document.addEventListener('click', () => langMenu.classList.remove('active'));
    langMenu.querySelectorAll('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const lang = opt.getAttribute('data-lang');
        if (window.I18N) window.I18N.setLanguage(lang);
        langMenu.classList.remove('active');
      });
    });
  }

  // Language change sync
  document.addEventListener('languageChanged', () => {
    if (AppState.alerts && AppState.alerts.length) {
      const container = document.getElementById('alertsContainer');
      const allContainer = document.getElementById('allAlertsContainer');
      renderAlertCards(AppState.alerts, container, 3);
      if (allContainer) renderAlertCards(AppState.alerts, allContainer, 20);
    }
    fetchHelplines();
    renderProfileView();
    renderSheltersList();
    fetchHazardReports();
    fetchSafetyCheckins();
    if (window.MapController && window.MapController.map) {
      window.MapController.updateUserLocation();
      window.MapController.loadAllFacilities();
    }
  });

  // Nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', function () {
      switchPage(this.getAttribute('data-page'));
    });
  });

  // Locate Me button
  const locateBtn = document.getElementById('locateBtn');
  if (locateBtn) locateBtn.addEventListener('click', detectUserLocation);

  // Initialize SOS button
  if (window.SosController) window.SosController.init();

  // Initialize WebSockets
  initWebSocket();

  // Load initial data
  detectUserLocation();
  fetchAlerts();
  fetchHelplines();
  fetchRiverMonitor();
  fetchHazardReports();
  fetchSafetyCheckins();
  loadUserProfile();

  // Global voice stop button
  const voiceStopBtn = document.getElementById('globalVoiceStopBtn');
  if (voiceStopBtn) {
    voiceStopBtn.addEventListener('click', () => {
      if (window.VoiceEngine) window.VoiceEngine.stop();
    });
  }

  // Modal close listeners
  const modalCloseBtn = document.getElementById('genericModalClose');
  const modalOverlay = document.getElementById('genericModalOverlay');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeGenericModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeGenericModal();
    });
  }
});
