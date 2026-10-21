# 🛡️ Suraksha Bandhan (सुरक्षा बंधन) v3.0
### India's Real-Time Disaster Early Warning & Emergency Response System

**Suraksha Bandhan** is a full-stack disaster management web application designed for citizens and emergency authorities across India. It provides real-time disaster alerts, live atmospheric risk monitoring, Central Water Commission (CWC) river flood gauges, emergency SOS broadcasting, 1-tap 112 calling, safe shelter navigation, and crowdsourced community hazard reporting.

---

## 🚀 Key Features & Improvements

### 1. Robust Full-Stack Backend
- **Node.js & Express REST API**: High-performance backend providing live data feeds for weather, air quality, CWC river water gauges, disaster alerts, nearby trauma centers, and safe shelters.
- **Real-Time WebSockets (`ws`)**: Instant live broadcasting of emergency SOS distress calls, new disaster warnings, and citizen hazard reports to all connected devices without page refresh.
- **Crash-Proof Persistent Database (`src/db.js`)**: Atomic file-write JSON storage for user profiles, emergency contacts, SOS event logs, hazard reports, and family safety check-ins.
- **Smart Server-Side Caching**: Eliminates 429 rate limits and CORS issues by caching Open-Meteo weather and air quality responses.

### 2. Up-To-Date & Fine-Tuned Indian Disaster Datasets
- **Current IMD & NDMA Alert Classifications**: Multi-hazard alerts categorized by standard 4-stage color codes (**RED** Critical, **ORANGE** High, **YELLOW** Advisory) for flash floods, severe thunderstorms, lightning, heatwaves, cyclones, landslides, and toxic smog (AQI 380+).
- **Central Water Commission (CWC) River Basins**: Real flood monitoring stations across major Indian rivers (Ganga, Yamuna, Brahmaputra, Godavari, Krishna, Cauvery, Mahanadi, Narmada) tracking Warning Levels, Danger Levels, and flood crest trends (Rising / Steady / Falling).
- **Unified Emergency Helplines**: Highlighting **112 (ERSS - National Emergency Response Support System)** alongside 108 (Ambulance), 101 (Fire), 100 (Police), 1070 (State Relief Commissioner), 1077 (District DEOC), 1078 (NDMA), and 1913 (CWC Flood).
- **Verified Hospitals & Designated Shelters**: Geo-coordinates, bed capacity, ICU availability, and 24x7 blood bank status for tertiary hospitals and multi-purpose cyclone/flood shelters.

### 3. User-Friendly & Accessible For Everyone
- **Audio Voice Reader (Text-to-Speech)**: Integrated Web Speech API reader that speaks out disaster warnings and survival steps in local Indian languages (**हिन्दी**, **English**, **বাংলা**, **தமிழ்**, **తెలుగు**, **मराठी**, **ગુજરાતી**).
- **In-Browser Emergency Audio Siren**: Web Audio API tone generator creating instant audible alarm sirens without requiring external audio files.
- **One-Tap "I Am Safe" (मैं सुरक्षित हूँ)**: Generates pre-formatted WhatsApp and SMS status messages with verified GPS coordinates and Google Maps links to immediately reassure family members.
- **Citizen Hazard Reporting**: Crowdsourced reporting tool allowing residents to report waterlogging, fallen trees, live electric wires, landslides, or collapsed bridges directly onto the live community safety map.
- **Accessibility Modes**:
  - High-Contrast Mode for low vision or direct sunlight visibility.
  - Dynamic Font Size Scaling (Normal, Large, Extra Large).
- **Dual Desktop & Mobile Experience**:
  - Mobile: Intuitive touch-friendly mobile interface with thumb-reach SOS and bottom navigation.
  - Desktop / Tablet: Expansive Command Center layout with dual-column dashboards, facility maps, and live emergency tickers.
- **PWA & Offline Resilience**: Service Worker (`sw.js`) and Web App Manifest (`manifest.json`) for offline access to emergency contacts, first-aid protocols, and saved guides during network disruptions.

---

## 🛠️ Project Structure

```
bharathack/
├── package.json               # Project dependencies and start scripts
├── server.js                  # Express API + WebSocket server
├── src/
│   └── db.js                  # Crash-proof JSON database engine with atomic writes
├── data/
│   ├── alerts.json            # Up-to-date Indian disaster alerts (IMD & NDMA)
│   ├── rivers.json            # Central Water Commission river flood monitoring stations
│   ├── hospitals.json         # Emergency tertiary hospitals and trauma centers
│   ├── shelters.json          # Multi-purpose disaster shelters and safe zones
│   ├── helplines.json         # Pan-India emergency helplines directory
│   ├── guides.json            # Disaster survival and first-aid protocols
│   └── db.json                # Persistent user profiles, SOS logs & hazard reports
└── public/
    ├── index.html             # Accessible, responsive interface (Desktop + Mobile)
    ├── manifest.json          # PWA Web App Manifest
    ├── sw.js                  # Offline Service Worker
    ├── css/
    │   └── style.css          # Modern stylesheet with high-contrast & themes
    └── js/
        ├── app.js             # Core application controller & WebSocket listener
        ├── i18n.js            # Localization in 7 Indian languages
        ├── speech.js          # Text-to-speech voice reader & emergency audio siren
        ├── map.js             # Leaflet interactive map for shelters & hospitals
        └── sos.js             # 3s SOS trigger, 112 speed-dial & 'I Am Safe' check-in
```

---

## 🏃 Getting Started

### Prerequisites
- Node.js (v18 or higher; tested and verified on Node.js v23)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The application will launch on:
```
http://localhost:3000
```

### 3. Development Mode (with file watching)
```bash
npm run dev
```

---

## 🌐 API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Server uptime and WebSocket connection status |
| `GET` | `/api/alerts` | Active disaster alerts (filterable by severity & coordinates) |
| `POST` | `/api/alerts` | Dispatch new emergency broadcast |
| `GET` | `/api/weather` | Live Open-Meteo atmospheric risk and weather proxy |
| `GET` | `/api/aqi` | Real-time Air Quality Index with health advice |
| `GET` | `/api/rivers/nearby` | Closest CWC river monitoring station & danger levels |
| `GET` | `/api/hospitals/nearby`| Emergency trauma hospitals sorted by proximity |
| `GET` | `/api/shelters/nearby` | Designated safe shelters sorted by proximity |
| `GET` | `/api/helplines` | Official Indian emergency numbers directory |
| `GET` | `/api/guides` | Multi-disaster survival and first-aid guides |
| `POST` | `/api/sos` | Real-time SOS emergency dispatch and peer broadcast |
| `POST` | `/api/safety-checkin`| "I Am Safe" status check-in registry |
| `GET` | `/api/reports` | Crowdsourced citizen hazard reports |
| `POST` | `/api/reports` | Submit local hazard report to community map |
| `GET` | `/api/profile` | Synchronize and fetch cloud user profile |
| `POST` | `/api/profile` | Save emergency profile & medical details |

---

## 🇮🇳 Built for India's Safety
*Suraksha Bandhan is designed to support the mission of the National Disaster Management Authority (NDMA), India Meteorological Department (IMD), and Central Water Commission (CWC).*
