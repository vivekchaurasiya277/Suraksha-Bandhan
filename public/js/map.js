// Leaflet Map & Safe Zones Controller for Suraksha Bandhan
const MapController = {
  map: null,
  markers: [],
  userMarker: null,
  userAccuracyCircle: null,
  activeFilter: 'all',

  init() {
    const mapEl = document.getElementById('shelterMap');
    if (!mapEl) return;

    if (this.map) {
      this.map.invalidateSize();
      return;
    }

    const defaultLat = window.AppState ? window.AppState.userLocation.lat || 26.4499 : 26.4499;
    const defaultLon = window.AppState ? window.AppState.userLocation.lon || 80.3319 : 80.3319;

    this.map = L.map('shelterMap', {
      zoomControl: true,
      attributionControl: true
    }).setView([defaultLat, defaultLon], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors | NDMA India'
    }).addTo(this.map);

    this.updateUserLocation();
    this.loadAllFacilities();
  },

  updateUserLocation() {
    if (!this.map || !window.AppState) return;
    const { lat, lon, city } = window.AppState.userLocation;
    if (!lat || !lon) return;

    if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
    }

    const userIcon = L.divIcon({
      className: 'user-pin-marker',
      html: `
        <div class="user-pulse-wrap">
          <div class="user-pulse-ring"></div>
          <div class="user-pulse-dot"><i class="fas fa-location-arrow"></i></div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    const localizedCity = window.I18N ? window.I18N.localizeLocation(city || 'Detected Location') : (city || 'Detected Location');
    const hereTitle = window.I18N ? window.I18N.get('mapYouAreHere') : 'You Are Here';

    this.userMarker = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 })
      .addTo(this.map)
      .bindPopup(`
        <div class="map-popup-card">
          <h4 style="color:var(--primary);margin-bottom:4px;"><i class="fas fa-street-view"></i> ${hereTitle}</h4>
          <p style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px;">${localizedCity}</p>
          <small style="color:var(--text3);">${lat.toFixed(4)}, ${lon.toFixed(4)}</small>
        </div>
      `);

    this.map.setView([lat, lon], 13);
  },

  clearMarkers() {
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
  },

  setFilter(filterType) {
    this.activeFilter = filterType;
    document.querySelectorAll('.map-control-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
    });
    this.loadAllFacilities();
  },

  async loadAllFacilities() {
    if (!this.map) return;
    this.clearMarkers();

    const lat = window.AppState ? window.AppState.userLocation.lat : 26.4499;
    const lon = window.AppState ? window.AppState.userLocation.lon : 80.3319;

    // 1. Safe Shelters
    if (this.activeFilter === 'all' || this.activeFilter === 'shelter') {
      try {
        const res = await fetch(`/api/shelters/nearby?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        if (data.shelters) {
          data.shelters.forEach(s => this.addShelterMarker(s));
        }
      } catch (e) {
        console.warn('Shelter load error:', e);
      }
    }

    // 2. Emergency Hospitals
    if (this.activeFilter === 'all' || this.activeFilter === 'hospital') {
      try {
        const res = await fetch(`/api/hospitals/nearby?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        if (data.hospitals) {
          data.hospitals.forEach(h => this.addHospitalMarker(h));
        }
      } catch (e) {
        console.warn('Hospital load error:', e);
      }
    }

    // 3. CWC Rivers & Water Gauges
    if (this.activeFilter === 'all' || this.activeFilter === 'river') {
      try {
        const res = await fetch(`/api/rivers/nearby?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        if (data.nearbyStations) {
          data.nearbyStations.forEach(r => this.addRiverMarker(r));
        }
      } catch (e) {
        console.warn('River load error:', e);
      }
    }

    // 4. Crowdsourced Citizen Hazard Reports
    if (this.activeFilter === 'all' || this.activeFilter === 'hazards') {
      try {
        const res = await fetch(`/api/reports`);
        const data = await res.json();
        if (data.reports) {
          data.reports.forEach(rep => this.addHazardMarker(rep));
        }
      } catch (e) {
        console.warn('Hazard reports load error:', e);
      }
    }
  },

  addShelterMarker(s) {
    const icon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div class="facility-pin shelter-pin"><i class="fas fa-shield-heart"></i></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([s.lat, s.lon], { icon }).addTo(this.map);
    const lang = window.I18N ? window.I18N.currentLang : 'hi';
    const isNonEn = lang !== 'en';
    const distUnit = isNonEn ? 'किमी दूर' : 'km away';
    const personsUnit = isNonEn ? 'व्यक्ति' : 'persons';
    const distText = s.distanceKm ? `${s.distanceKm} ${distUnit}` : '';
    const shelterTag = window.I18N ? window.I18N.get('mapSafeShelterTag') : 'Safe Shelter';
    const capLabel = window.I18N ? window.I18N.get('mapCapacity') : 'Capacity';
    const navLabel = window.I18N ? window.I18N.get('mapNavigate') : 'Navigate (Google Maps)';

    const sName = (isNonEn && s.name_hi) ? s.name_hi : (window.I18N ? window.I18N.localizeLocation(s.name) : s.name);
    const sCity = window.I18N ? window.I18N.localizeLocation(s.city || s.district) : (s.city || s.district);
    const sState = window.I18N ? window.I18N.localizeLocation(s.state) : s.state;

    marker.bindPopup(`
      <div class="map-popup-card">
        <span class="facility-badge shelter-badge"><i class="fas fa-shield-alt"></i> ${shelterTag}</span>
        <h4>${sName}</h4>
        <p><i class="fas fa-users"></i> ${capLabel}: <strong>${s.capacity} ${personsUnit}</strong></p>
        <p><i class="fas fa-map-marker-alt"></i> ${sCity}, ${sState}</p>
        ${distText ? `<p style="color:var(--success);font-weight:700;"><i class="fas fa-route"></i> ${distText}</p>` : ''}
        <div class="popup-amenities">
          ${(s.amenities || []).map(a => `<span class="amenity-chip">${window.I18N ? window.I18N.localizeAmenity(a) : a}</span>`).join('')}
        </div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" class="popup-dir-btn">
          <i class="fas fa-directions"></i> ${navLabel}
        </a>
      </div>
    `);
    this.markers.push(marker);
  },

  addHospitalMarker(h) {
    const icon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div class="facility-pin hospital-pin"><i class="fas fa-hospital"></i></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([h.lat, h.lon], { icon }).addTo(this.map);
    const lang = window.I18N ? window.I18N.currentLang : 'hi';
    const isNonEn = lang !== 'en';
    const distUnit = isNonEn ? 'किमी दूर' : 'km away';
    const distText = h.distanceKm ? `${h.distanceKm} ${distUnit}` : '';
    const traumaTag = window.I18N ? window.I18N.get('mapTraumaTag') : 'Emergency Trauma';
    const navLabel = window.I18N ? window.I18N.get('mapNavigate') : 'Navigate';
    const bedsLabel = isNonEn ? 'कुल बेड' : 'Total Beds';
    const icuLabel = isNonEn ? 'आईसीयू' : 'ICU';
    const bloodBankLabel = isNonEn ? '24x7 ब्लड बैंक: उपलब्ध' : '24x7 Blood Bank: Available';
    const callLabel = isNonEn ? '108 पर कॉल करें' : 'Call 108';

    const hName = (isNonEn && h.name_hi) ? h.name_hi : (window.I18N ? window.I18N.localizeLocation(h.name) : h.name);
    const hAddr = (isNonEn && h.address_hi) ? h.address_hi : (window.I18N ? window.I18N.localizeLocation(h.address || h.city) : (h.address || h.city));

    marker.bindPopup(`
      <div class="map-popup-card">
        <span class="facility-badge hospital-badge"><i class="fas fa-crosshairs"></i> ${traumaTag}</span>
        <h4>${hName}</h4>
        <p><i class="fas fa-bed"></i> ${bedsLabel}: <strong>${h.totalBeds || '500+'}</strong> ${h.icuBeds ? `(${icuLabel}: ${h.icuBeds})` : ''}</p>
        <p><i class="fas fa-tint" style="color:var(--primary);"></i> ${bloodBankLabel}</p>
        <p><i class="fas fa-map-pin"></i> ${hAddr}</p>
        ${h.phone ? `<p><i class="fas fa-phone-alt"></i> Tel: <a href="tel:${h.phone}">${h.phone}</a></p>` : ''}
        ${distText ? `<p style="color:var(--info);font-weight:700;"><i class="fas fa-route"></i> ${distText}</p>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;">
          <a href="tel:${h.emergencyPhone || '108'}" class="popup-call-btn"><i class="fas fa-phone"></i> ${callLabel}</a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}" target="_blank" class="popup-dir-btn"><i class="fas fa-directions"></i> ${navLabel}</a>
        </div>
      </div>
    `);
    this.markers.push(marker);
  },

  addRiverMarker(r) {
    const isCritical = r.status === 'critical';
    const pinClass = isCritical ? 'river-pin-critical' : 'river-pin-warning';
    const icon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div class="facility-pin ${pinClass}"><i class="fas fa-water"></i></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([r.coordinates.lat, r.coordinates.lon], { icon }).addTo(this.map);
    const lang = window.I18N ? window.I18N.currentLang : 'hi';
    const isNonEn = lang !== 'en';
    const riverTag = window.I18N ? window.I18N.get('mapRiverStationTag') : 'CWC River Station';
    const curLevelStr = window.I18N ? window.I18N.get('waterLevel') : 'Current Level';
    const dangerLevelStr = window.I18N ? window.I18N.get('dangerLevel') : 'Danger Mark';
    const trendLabel = isNonEn ? 'प्रवृत्ति (Trend)' : 'Trend';

    let trendVal = r.trend;
    if (isNonEn) {
      if (r.trend === 'Rising') trendVal = 'बढ़ रहा है (Rising)';
      else if (r.trend === 'Falling') trendVal = 'घट रहा है (Falling)';
      else if (r.trend === 'Steady') trendVal = 'स्थिर (Steady)';
    }

    const rName = (isNonEn && r.river_hi) ? r.river_hi : r.river;
    const rStation = (isNonEn && r.station_hi) ? r.station_hi : r.station;
    const rAlert = (isNonEn && r.alertMessage_hi) ? r.alertMessage_hi : r.alertMessage;

    marker.bindPopup(`
      <div class="map-popup-card">
        <span class="facility-badge river-badge"><i class="fas fa-water"></i> ${riverTag}</span>
        <h4>${rName} - ${rStation}</h4>
        <p><i class="fas fa-ruler-vertical"></i> ${curLevelStr}: <strong>${r.currentLevel} m</strong></p>
        <p><i class="fas fa-exclamation-triangle"></i> ${dangerLevelStr}: <strong>${r.dangerLevel} m</strong></p>
        <p><i class="fas fa-chart-line"></i> ${trendLabel}: <strong>${trendVal}</strong></p>
        <p style="font-size:11px;color:var(--text2);margin-top:4px;">${rAlert}</p>
      </div>
    `);
    this.markers.push(marker);
  },

  addHazardMarker(rep) {
    if (!rep.coordinates || !rep.coordinates.lat || !rep.coordinates.lon) return;
    const icon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div class="facility-pin hazard-pin"><i class="fas fa-triangle-exclamation"></i></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([rep.coordinates.lat, rep.coordinates.lon], { icon }).addTo(this.map);
    const lang = window.I18N ? window.I18N.currentLang : 'hi';
    const isNonEn = lang !== 'en';
    const repTag = window.I18N ? window.I18N.get('mapCitizenReportTag') : 'Citizen Report';
    const hazardTypeStr = window.I18N ? window.I18N.localizeHazardType(rep.type) : rep.type;

    marker.bindPopup(`
      <div class="map-popup-card">
        <span class="facility-badge hazard-badge"><i class="fas fa-bullhorn"></i> ${repTag}</span>
        <h4>${hazardTypeStr}</h4>
        <p style="font-size:12px;margin:4px 0;">${rep.description}</p>
        <small style="color:var(--text3);"><i class="fas fa-clock"></i> ${new Date(rep.timestamp).toLocaleTimeString()}</small>
      </div>
    `);
    this.markers.push(marker);
  }
};

window.MapController = MapController;
