/**
 * pipepal.js (with Contact Capture, Tech Forwarding & Appointment Flow)
 */

function initPipepal() {
  console.log("✅ Pipepal JS Loaded");

  // ── CONFIG
  const WEBHOOK_URL  = 'https://ganzy88.app.n8n.cloud/webhook/pipepal-sosy';
  const TECH_WEBHOOK = 'https://ganzy88.app.n8n.cloud/webhook/receive-ticket';
  const APPT_WEBHOOK = 'https://ganzy88.app.n8n.cloud/webhook/log-lead';
  const STORAGE_KEY  = 'pipepal_chat_history';
  const USER_KEY     = 'pipepal_user_data';
  let voiceEnabled   = true;
  let context        = {};

  // ── Persistence Helpers
  function saveHistory(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function saveUserData() {
    localStorage.setItem(USER_KEY, JSON.stringify({
      name:    context.Name || 'Unknown',
      phone:   context.Phone || 'N/A',
      address: context.Address || 'N/A',
      lastIntent: context.IntentName || ''
    }));
  }
  function loadUserData() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) || {}; }
    catch { return {}; }
  }

  // ── UI Helpers
  function persistMessage(role, html) {
    const h = loadHistory(); h.push({ role, html }); saveHistory(h);
  }
  function showBotMessage(text, isHTML = false) {
    const m = document.createElement('div');
    m.className = 'pipepal-msg pipepal-bot';
    isHTML ? m.innerHTML = text : m.textContent = text;
    body.appendChild(m);
    persistMessage('bot', isHTML ? text : m.textContent);
    speakText(text);
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    m.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Greeting
  function greetUser() {
    const u = loadUserData();
    if (u.name) showBotMessage(`Welcome back, ${u.name}! How can I help today?`);
    else         showBotMessage("Hi there! I’m PipePal. How can I help today?");
  }

  // ── TTS
  function speakText(raw) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    const plain = raw.replace(/<[^>]+>/g, '');
    const clean = plain.replace(/[\u{1F300}-\u{1F6FF}]/gu, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US'; speechSynthesis.speak(u);
  }

  // ── Core Elements
  const toggle    = document.getElementById('pipepal-toggle');
  const chat      = document.getElementById('pipepal-chat');
  const closeBtn  = document.getElementById('pipepal-close');
  const sendBtn   = document.getElementById('pipepal-send');
  const input     = document.getElementById('pipepal-user-input');
  const body      = document.getElementById('pipepal-body');
  const typing    = document.getElementById('pipepal-typing');
  const header    = document.getElementById('pipepal-header');
  let voiceToggle = document.getElementById('pipepal-voice-toggle');

  // Create voice toggle if missing
  if (header && !voiceToggle) {
    voiceToggle = document.createElement('button');
    voiceToggle.id          = 'pipepal-voice-toggle';
    voiceToggle.title       = 'Toggle Voice';
    voiceToggle.textContent = '🔊';
    header.appendChild(voiceToggle);
  }

  if (![toggle, chat, closeBtn, sendBtn, input, body, typing, voiceToggle].every(el => el)) {
    console.warn('❌ Missing elements'); return;
  }

  // ── Voice Toggle
  voiceToggle.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    if (!voiceEnabled) speechSynthesis.cancel();
    voiceToggle.textContent = voiceEnabled ? '🔊' : '🔇';
  });

  // ── Quick Replies
  const quickMap = {
    'Book Appointment':    'schedule_appointment',
    'Get Quote':           'price',
    'Live Agent':          'connect_human',
    'Plumbing Emergency':  '🚨 EMERGENCY: Burst pipe/flooding',
    'Electrical Emergency':'🚨 EMERGENCY: Sparks/power outage',
    'Heating Emergency':   '🚨 EMERGENCY: No heating/cooling'
  };
  document.querySelectorAll('.pipepal-quick-buttons button').forEach(btn =>
    btn.addEventListener('click', () => {
      input.value = quickMap[btn.textContent.trim()] || btn.textContent.trim();
      sendBtn.click();
    })
  );

  // ── Photo Upload Shim
  const fileInput = document.createElement('input');
  fileInput.type    = 'file';
  fileInput.accept  = 'image/*,.pdf';
  fileInput.id      = 'pipepal-file-upload';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  window.openPhotoDiagnosis = () => {
    if (chat.classList.contains('pipepal-hidden')) chat.classList.remove('pipepal-hidden');
    fileInput.click();
  };
  fileInput.addEventListener('change', () => { if (fileInput.files.length) processUserInput(); });

  // ── Predictive FAQs
  const suggestionsContainer = document.getElementById('autocomplete-suggestions');
  let debounceTimer = null;
  input.addEventListener('input', e => {
    clearTimeout(debounceTimer);
    const q = e.target.value.trim();
    if (q.length < 2) { suggestionsContainer.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch('/.netlify/functions/autocomplete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: q })
        });
        const { suggestions } = await res.json();
        renderSuggestions(suggestions);
      } catch {
        suggestionsContainer.innerHTML = '';
      }
    }, 300);
  });
  function renderSuggestions(list) {
    suggestionsContainer.innerHTML = '';
    list.forEach(item => {
      const div = document.createElement('div');
      div.textContent = item;
      div.className   = 'autocomplete-item';
      div.onclick     = () => { input.value = item; suggestionsContainer.innerHTML = ''; sendBtn.click(); };
      suggestionsContainer.appendChild(div);
    });
  }
  document.addEventListener('click', e => {
    if (!document.getElementById('pipepal-input-container').contains(e.target)) {
      suggestionsContainer.innerHTML = '';
    }
  });

  // ── UI Events
  toggle.addEventListener('click', () => chat.classList.toggle('pipepal-hidden'));
  closeBtn.addEventListener('click', () => chat.classList.add('pipepal-hidden'));
  input.addEventListener('keypress', e => e.key==='Enter' && sendBtn.click());
  sendBtn.addEventListener('click', processUserInput);

  // ── Initial Render
  const userData = loadUserData();
  context.Name    = userData.name || '';
  context.Phone   = userData.phone|| '';
  context.Address = userData.address|| '';
  renderHistory(body);
  greetUser();

  // ── Send Appointment Request
  async function sendAppointmentRequest() {
    const apptFD = new FormData();
    apptFD.append('Name',             context.Name);
    apptFD.append('Email',            context.Email);
    apptFD.append('Phone',            context.Phone);
    apptFD.append('RequestedService', 'Appointment');
    apptFD.append('PreferredDate',    context.AppointmentDate);
    if (fileInput.files[0]) apptFD.append('imageFile', fileInput.files[0]);
    try {
      const r = await fetch(APPT_WEBHOOK, { method: 'POST', body: apptFD });
      if (r.ok) showBotMessage(`✅ Thanks ${context.Name}! Your appointment for ${context.AppointmentDate} is booked.`, false);
      else     showBotMessage('⚠️ Could not book appointment. Please try again.', false);
    } catch {
      showBotMessage('⚠️ Network error booking appointment.', false);
    }
  }

  // ── Main Logic
  async function processUserInput() {
    const msg = input.value.trim();
    input.value = '';
    suggestionsContainer.innerHTML = '';
    const file = fileInput.files[0];
    if (!msg && !file) return;

    // Render user bubble
    const u = document.createElement('div'); u.className = 'pipepal-msg pipepal-user';
    if (file) {
      const r = new FileReader();
      r.onload = e => {
        u.innerHTML = `<img src="${e.target.result}" style="max-width:100%;border-radius:8px;"><br>${msg||''}`;
        body.appendChild(u);
        u.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        persistMessage('user', u.innerHTML);
      };
      r.readAsDataURL(file);
    } else {
      u.textContent = msg;
      body.appendChild(u);
      u.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      persistMessage('user', msg);
    }

    // Send to main webhook
    let data = {};
    try {
      const fd = new FormData();
      if (msg) fd.append('message', msg);
      if (file) fd.append('imageFile', file);
      fd.append('context', JSON.stringify(context));
      const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd });
      const text = await res.text(); data = text ? JSON.parse(text) : {};
      if (Array.isArray(data)) data = data[0]||{};
      if (data.IntentName) context.IntentName = data.IntentName;
      if (data.Name)       context.Name       = data.Name;
      saveUserData();

      // Emergency branch
      if (data.emergencyType) {
        showBotMessage(`🚨 ${data.emergencyType} Emergency!`, false);
        showBotMessage(
          `<a href="tel:5203332121" class="pipepal-emergency-btn">📞 Call ${data.emergencyType} Emergency</a>`,
          true
        );
        // Forward ticket
        const tf = new FormData();
        if (file) tf.append('imageFile', file);
        tf.append('issueType', data.emergencyType);
        tf.append('notes', msg);
        tf.append('userName', context.Name);
        tf.append('userPhone', context.Phone);
        fetch(TECH_WEBHOOK, { method: 'POST', body: tf });
        return;
      }

      // Appointment branch
      if (data.IntentName === 'Appointment' && !context.AppointmentDate) {
        showBotMessage(
          `<div class="pipepal-form">
            <input id="appt-name"        placeholder="Your full name" />
            <input id="appt-email"       placeholder="Your email" />
            <input id="appt-phone"       placeholder="Your phone number" />
            <input id="appt-date" type="date" />
            <button id="appt-submit">Book Appointment</button>
          </div>`,
          true
        );
        document.getElementById('appt-submit').onclick = () => {
          context.Name            = document.getElementById('appt-name').value.trim()  || 'Unknown';
          context.Email           = document.getElementById('appt-email').value.trim() || 'N/A';
          context.Phone           = document.getElementById('appt-phone').value.trim() || 'N/A';
          context.AppointmentDate = document.getElementById('appt-date').value       || 'N/A';
          saveUserData();
          sendAppointmentRequest();
        };
        return;
      }

      // Quote/pricing or other intents fall through:
      const reply = data.reply || data.customerMessage || '';
      if (reply) showBotMessage(reply, /<[^>]+>/.test(reply));
    } catch(err) {
      console.error(err);
      showBotMessage(`🚨 Error: ${err.message}`, false);
    } finally {
      typing.style.display = 'none';
      fileInput.value = '';
    }
  }

  // ── History Renderer
  function renderHistory(container) {
    loadHistory().forEach(({ role, html }) => {
      const m = document.createElement('div');
      m.className = `pipepal-msg pipepal-${role}`;
      m.innerHTML = html;
      container.appendChild(m);
    });
  }
}
window.initPipepal = initPipepal;
