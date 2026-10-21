// Voice Speech Synthesis & Emergency Siren Engine for Suraksha Bandhan v3.0
const VoiceEngine = {
  isSpeaking: false,
  currentAudio: null,
  synth: window.speechSynthesis || null,
  audioCtx: null,
  sirenOsc: null,
  sirenGain: null,
  isSirenPlaying: false,

  // Map I18N language code to browser SpeechSynthesis voice locale
  localeMap: {
    en: 'en-IN',
    hi: 'hi-IN',
    bn: 'bn-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    mr: 'mr-IN',
    gu: 'gu-IN'
  },

  init() {
    // Warm up voices on first user interaction if speechSynthesis is present
    if (this.synth) {
      window.addEventListener('click', () => {
        if (!this.voicesLoaded && this.synth.getVoices) {
          this.synth.getVoices();
          this.voicesLoaded = true;
        }
      }, { once: true });
    }

    // Pre-warm safety voice in background after brief delay
    setTimeout(() => {
      this.preloadSafetySummary();
    }, 1200);
  },

  getBestVoice(langCode) {
    if (!this.synth) return null;
    const voices = this.synth.getVoices();
    if (!voices || !voices.length) return null;

    const targetLocale = this.localeMap[langCode] || 'en-IN';
    const langPrefix = targetLocale.split('-')[0].toLowerCase();

    // 1. Exact match e.g. hi-IN
    let match = voices.find(v => v.lang && v.lang.toLowerCase().replace('_', '-') === targetLocale.toLowerCase());
    // 2. Prefix match e.g. hi
    if (!match) {
      match = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
    }
    // 3. Indian English or any English
    if (!match && langCode === 'en') {
      match = voices.find(v => v.lang && (v.lang.includes('IN') || v.lang.startsWith('en')));
    }
    return match || voices[0] || null;
  },

  // Instant subtle click feedback so the user immediately knows the tap was registered
  playImmediateClickTone() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (_) {}
  },

  // Primary Speech method: Uses Neural TTS API with automatic language adaptation & instant feedback
  speak(text, langCode, onEndCallback) {
    this.stop(); // Stop any ongoing speech or audio immediately

    const currentLang = langCode || (window.I18N && window.I18N.currentLang ? window.I18N.currentLang : 'hi');
    const cleanText = (text || '').replace(/[#*_`]/g, '').trim();

    if (!cleanText) return;

    // 1. Instant tactile audio chime
    this.playImmediateClickTone();

    this.isSpeaking = true;
    document.body.classList.add('voice-reading-active');

    const stopBtn = document.getElementById('globalVoiceStopBtn');
    if (stopBtn) stopBtn.style.display = 'flex';

    // 2. Instant visual spinner on button
    const summaryBtn = document.querySelector('.voice-summary-btn');
    let summaryIcon = null;
    if (summaryBtn) {
      summaryBtn.classList.add('loading-voice');
      summaryIcon = summaryBtn.querySelector('i');
      if (summaryIcon) summaryIcon.className = 'fas fa-circle-notch fa-spin';
    }

    // 3. Use or create persistent audio element for mobile Safari/Chrome compatibility
    let audio = document.getElementById('surakshaVoiceAudio');
    if (!audio) {
      audio = new Audio();
      audio.id = 'surakshaVoiceAudio';
      audio.setAttribute('playsinline', '');
      audio.preload = 'auto';
      document.body.appendChild(audio);
    }

    const audioUrl = `/api/tts?lang=${encodeURIComponent(currentLang)}&text=${encodeURIComponent(cleanText)}`;
    audio.src = audioUrl;
    this.currentAudio = audio;

    // As soon as audio actually begins playing, switch icon to speaker pulse
    audio.onplay = () => {
      if (summaryBtn) {
        summaryBtn.classList.remove('loading-voice');
        summaryBtn.classList.add('speaking');
        if (summaryIcon) summaryIcon.className = 'fas fa-volume-high';
      }
    };

    audio.onended = () => {
      this.isSpeaking = false;
      this.currentAudio = null;
      document.body.classList.remove('voice-reading-active');
      if (stopBtn) stopBtn.style.display = 'none';
      if (summaryBtn) {
        summaryBtn.classList.remove('loading-voice', 'speaking');
        if (summaryIcon) summaryIcon.className = 'fas fa-volume-high';
      }
      if (typeof onEndCallback === 'function') onEndCallback();
    };

    audio.onerror = (err) => {
      console.warn('Neural TTS audio stream failed, falling back to local speech engine:', err);
      if (this.synth) {
        this.speakFallbackSpeechSynthesis(cleanText, currentLang, onEndCallback);
      } else {
        this.stop();
        if (typeof showToast === 'function') {
          showToast('आवाज़ लोड करने में असमर्थ।', 'info');
        }
      }
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Audio play prevented or blocked, falling back to speech synthesis:', err);
        if (this.synth) {
          this.speakFallbackSpeechSynthesis(cleanText, currentLang, onEndCallback);
        } else {
          this.stop();
        }
      });
    }
  },

  // Generates concise, punchy emergency status text (under 100 chars for 1-chunk ultra-fast delivery)
  getSafetySummaryText(targetLang) {
    const lang = targetLang || (window.I18N && window.I18N.currentLang ? window.I18N.currentLang : 'hi');
    const state = window.AppState || {};
    const rawCity = (state.userLocation && state.userLocation.city) || '';
    const city = rawCity ? rawCity.split(',')[0].trim() : '';
    const river = state.closestRiver;

    const banner = document.getElementById('statusBanner');
    const isDanger = banner && banner.classList.contains('danger');
    const isWarning = banner && banner.classList.contains('warning');

    if (lang === 'hi') {
      let t = 'सुरक्षा बंधन रिपोर्ट: ';
      if (city) t += `${city} में `;
      if (isDanger) {
        t += 'रेड अलर्ट है, तुरंत सुरक्षित स्थान पर जाएं। ';
      } else if (isWarning) {
        t += 'मौसम परामर्श सक्रिय है, सतर्क रहें। ';
      } else {
        t += 'स्थिति सामान्य है, कोई तत्काल आपदा खतरा नहीं है। ';
      }
      if (river && river.status === 'critical') {
        t += `${river.river} नदी खतरे के निशान से ऊपर है। `;
      }
      t += 'आपात स्थिति में 112 डायल करें या एसओएस दबाएं।';
      return t;
    }

    if (lang === 'bn') {
      let t = 'সুরক্ষা বন্ধন রিপোর্ট: ';
      if (city) t += `${city} অঞ্চলে `;
      if (isDanger) {
        t += 'রেড অ্যালার্ট জারি রয়েছে, অবিলম্বে নিরাপদ আশ্রয়ে যান। ';
      } else if (isWarning) {
        t += 'আবহাওয়া সতর্কতা সক্রিয় রয়েছে, সতর্ক থাকুন। ';
      } else {
        t += 'পরিস্থিতি স্বাভাবিক রয়েছে, কোনো জরুরি বিপদ নেই। ';
      }
      if (river && river.status === 'critical') {
        t += `${river.river} নদীর জল বিপদসীমার উপরে। `;
      }
      t += 'জরুরি প্রয়োজনে ১১২ ডায়াল করুন অথবা এসওএস চাপুন।';
      return t;
    }

    if (lang === 'ta') {
      let t = 'சுரக்ஷா பந்தன் அறிக்கை: ';
      if (city) t += `${city} பகுதியில் `;
      if (isDanger) {
        t += 'ரெட் அலர்ட் நடைமுறையில் உள்ளது, பாதுகாப்பான இடத்திற்கு செல்லுங்கள். ';
      } else if (isWarning) {
        t += 'வானிலை எச்சரிக்கை நடைமுறையில் உள்ளது, கவனமாக இருங்கள். ';
      } else {
        t += 'நிலைமை இயல்பாக உள்ளது, உடனடி ஆபத்து இல்லை. ';
      }
      if (river && river.status === 'critical') {
        t += `${river.river} நீர்மட்டம் அபாய அளவில் உள்ளது. `;
      }
      t += 'அவசர உதவிக்கு 112 அழைக்கவும் அல்லது எஸ்ஓஎஸ் அழுத்தவும்.';
      return t;
    }

    if (lang === 'te') {
      let t = 'సురక్షా బంధన్ నివేదిక: ';
      if (city) t += `${city} ప్రాంతంలో `;
      if (isDanger) {
        t += 'రెడ్ అలర్ట్ ఉంది, వెంటనే సురక్షిత ప్రాంతానికి వెళ్లండి. ';
      } else if (isWarning) {
        t += 'వాతావరణ హెచ్చరిక అమల్లో ఉంది, జాగ్రత్తగా ఉండండి. ';
      } else {
        t += 'ప్రస్తుత పరిస్థితి సాధారణంగా ఉంది, ఎటువంటి ప్రమాదం లేదు. ';
      }
      if (river && river.status === 'critical') {
        t += `${river.river} నది ప్రమాద స్థాయిని దాటింది. `;
      }
      t += 'అత్యవసర సహాయం కోసం 112 డయల్ చేయండి లేదా ఎస్ఓఎస్ నొక్కండి.';
      return t;
    }

    if (lang === 'mr') {
      let t = 'सुरक्षा बंधन अहवाल: ';
      if (city) t += `${city} मध्ये `;
      if (isDanger) {
        t += 'रेड अलर्ट आहे, त्वरित सुरक्षित स्थळी जा. ';
      } else if (isWarning) {
        t += 'हवामान इशारा सक्रिय आहे, काळजी घ्या. ';
      } else {
        t += 'सध्या परिस्थिती सामान्य आहे, कोणताही धोका नाही. ';
      }
      if (river && river.status === 'critical') {
        t += `${river.river} नदी धोक्याच्या पातळीवर आहे. `;
      }
      t += 'तातडीच्या मदतीसाठी ११२ डायल करा किंवा एसओएस दाबा.';
      return t;
    }

    if (lang === 'gu') {
      let t = 'સુરક્ષા બંધન અહેવાલ: ';
      if (city) t += `${city} માં `;
      if (isDanger) {
        t += 'રેડ એલર્ટ છે, તાત્કાલિક સલામત સ્થળે જાઓ. ';
      } else if (isWarning) {
        t += 'હવામાન ચેતવણી સક્રિય છે, સાવચેત રહો. ';
      } else {
        t += 'હાલની સ્થિતિ સામાન્ય છે, કોઈ મોટો ખતરો નથી. ';
      }
      if (river && river.status === 'critical') {
        t += `${river.river} નદી ભયજનક સપાટી પર છે. `;
      }
      t += 'કટોકટીમાં ૧૧૨ ડાયલ કરો અથવા લાલ એસઓએસ બટન દબાવો.';
      return t;
    }

    // Default: English
    let t = 'Suraksha Bandhan Report: ';
    if (city) t += `Conditions in ${city} `;
    if (isDanger) {
      t += 'are under Red Alert, evacuate to safe shelter immediately. ';
    } else if (isWarning) {
      t += 'are under weather advisory, commute with care. ';
    } else {
      t += 'are normal and all clear. ';
    }
    if (river && river.status === 'critical') {
      t += `${river.river} is flowing above critical danger mark. `;
    }
    t += 'In any emergency, dial 112 or press emergency SOS.';
    return t;
  },

  // Generates safety status spoken narrative in the user's currently selected language
  speakSafetySummary() {
    const lang = (window.I18N && window.I18N.currentLang) ? window.I18N.currentLang : 'hi';
    const text = this.getSafetySummaryText(lang);
    this.speak(text, lang);
  },

  // Background pre-fetch: downloads and warms both server RAM and browser cache ahead of time!
  preloadSafetySummary() {
    try {
      const lang = (window.I18N && window.I18N.currentLang) ? window.I18N.currentLang : 'hi';
      const text = this.getSafetySummaryText(lang);
      if (!text) return;
      const audioUrl = `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;
      fetch(audioUrl, { priority: 'low' }).catch(() => {});
    } catch (_) {}
  },

  
  speakFallbackSpeechSynthesis(text, langCode, onEndCallback) {
    if (!this.synth) {
      this.stop();
      return;
    }
    try {
      this.synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.localeMap[langCode] || 'hi-IN';
      const voice = this.getBestVoice(langCode);
      if (voice) utterance.voice = voice;
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const summaryBtn = document.querySelector('.voice-summary-btn');
      if (summaryBtn) {
        summaryBtn.classList.remove('loading-voice');
        summaryBtn.classList.add('speaking');
      }

      utterance.onend = () => {
        this.stop();
        if (typeof onEndCallback === 'function') onEndCallback();
      };
      utterance.onerror = () => {
        this.stop();
      };

      this.synth.speak(utterance);
    } catch (e) {
      console.warn('SpeechSynthesis fallback error:', e);
      this.stop();
    }
  },

  stop() {
    // 1. Stop audio element
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }

    // 2. Stop speechSynthesis
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (_) {}
    }

    this.isSpeaking = false;
    document.body.classList.remove('voice-reading-active');

    const stopBtn = document.getElementById('globalVoiceStopBtn');
    if (stopBtn) stopBtn.style.display = 'none';

    const summaryBtn = document.querySelector('.voice-summary-btn');
    if (summaryBtn) summaryBtn.classList.remove('speaking');
  },

  // Web Audio API emergency sound generator (No external MP3 files needed!)
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  },

  // Gentle notification chime for alerts
  playChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.15); // A5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    } catch (err) {
      console.warn('Chime error:', err);
    }
  },

  // Real Emergency Pulsing Siren for SOS
  startEmergencySiren() {
    if (this.isSirenPlaying) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      this.isSirenPlaying = true;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      // Main tone
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(850, now);

      // Low frequency oscillator to modulate pitch between 700Hz and 1200Hz
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(1.5, now);
      lfoGain.gain.setValueAtTime(350, now);

      lfo.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.3, now);

      lfo.start(now);
      osc.start(now);

      this.sirenOsc = osc;
      this.sirenGain = gain;
      this.sirenLfo = lfo;
    } catch (err) {
      console.warn('Siren start error:', err);
    }
  },

  stopEmergencySiren() {
    if (!this.isSirenPlaying) return;
    try {
      if (this.sirenGain && this.audioCtx) {
        this.sirenGain.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2);
      }
      setTimeout(() => {
        if (this.sirenOsc) {
          try { this.sirenOsc.stop(); this.sirenOsc.disconnect(); } catch (_) {}
        }
        if (this.sirenLfo) {
          try { this.sirenLfo.stop(); this.sirenLfo.disconnect(); } catch (_) {}
        }
        this.isSirenPlaying = false;
      }, 250);
    } catch (err) {
      console.warn('Siren stop error:', err);
      this.isSirenPlaying = false;
    }
  }
};

window.VoiceEngine = VoiceEngine;
VoiceEngine.init();
