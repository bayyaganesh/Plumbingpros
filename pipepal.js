/**
 * pipepal.js
 * Integrated chat upload, quick replies, emergency handling,
 * updated reply extraction, plus page‑to‑page persistence.
 */

function initPipepal() {
  console.log("✅ Pipepal JS Loaded");

  // SESSION STORAGE KEY & HELPERS
  const STORAGE_KEY = 'pipepal_chat_history';
  // clear on full reload
  const nav = performance.getEntriesByType('navigation')[0] || {};
  if (nav.type === 'reload') sessionStorage.removeItem(STORAGE_KEY);

  function saveHistory(entries) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
  function loadHistory() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function renderHistory(body) {
    const hist = loadHistory();
    hist.forEach(({ role, html }) => {
      const msg = document.createElement('div');
      msg.className = 'pipepal-msg pipepal-' + role;
      msg.innerHTML = html;
      body.appendChild(msg);
    });
  }

  // Core Elements
  const toggle = document.getElementById('pipepal-toggle');
  const chat   = document.getElementById('pipepal-chat');
  const close  = document.getElementById('pipepal-close');
  const send   = document.getElementById('pipepal-send');
  const input  = document.getElementById('pipepal-user-input');
  const body   = document.getElementById('pipepal-body');
  const typing = document.getElementById('pipepal-typing');

  // Context Tracking
  let context = {
    IntentName: null,
    RequestedService: null,
    Name: null,
    Email: null,
    CustomerID: null
  };

  // Validate
  if (!toggle||!chat||!close||!send||!input||!body||!typing) {
    console.warn("❌ Pipepal elements not found.");
    return;
  }

  // Render previous session’s chat
  renderHistory(body);

  // File input shim
  const fileInput = document.createElement('input');
  fileInput.type    = 'file';
  fileInput.id      = 'pipepal-file-upload';
  fileInput.accept  = 'image/*,.pdf';
  fileInput.capture = 'environment';      // hint mobile to open camera
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  // Expose for photo button
  window.openPhotoDiagnosis = () => {
    if (chat.classList.contains('pipepal-hidden')) chat.classList.remove('pipepal-hidden');
    fileInput.click();
  };

  // UI event wiring
  toggle.addEventListener('click', () => chat.classList.toggle('pipepal-hidden'));
  close .addEventListener('click', () => chat.classList.add('pipepal-hidden'));
  input .addEventListener('keypress', e => e.key==='Enter' && send.click());
  send  .addEventListener('click', processUserInput);
  fileInput.addEventListener('change', handleFileUpload);

  // Quick replies map
  const quickMap = {
    'Get Quote': 'price',
    'Book Appointment': 'schedule_appointment',
    'Live Agent': 'connect_human',
    'Plumbing Emergency': '🚨 EMERGENCY: Burst pipe/flooding',
    'Electrical Emergency': '🚨 EMERGENCY: Sparks/power outage',
    'Heating Emergency': '🚨 EMERGENCY: No heating/cooling'
  };
  document.querySelectorAll('.pipepal-quick-buttons button').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.textContent.trim();
      // direct dial on emergency buttons
      if (key.includes('Emergency')) {
        window.location.href = 'tel:5203332121';
      } else {
        input.value = quickMap[key] || key;
        send.click();
      }
    });
  });

  // Helpers to persist each message
  function persistMessage(role, html) {
    const hist = loadHistory();
    hist.push({ role, html });
    saveHistory(hist);
  }

  // Show bot reply (and save to sessionStorage)
  function showBotMessage(text, isHTML = false) {
    const msg = document.createElement('div');
    msg.className = 'pipepal-msg pipepal-bot';
    if (isHTML) msg.innerHTML = text;
    else        msg.textContent = text;
    body.appendChild(msg);
    persistMessage('bot', isHTML ? text : msg.textContent);
  }

  // Handle file select
  function handleFileUpload() {
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    if (file.size > 5*1024*1024) {
      showBotMessage("⚠️ Please upload images under 5MB", true);
      return;
    }
    processUserInput();
  }

  // Main send logic
  async function processUserInput() {
    const raw = input.value.trim();
    const file = fileInput.files[0];

    // emergency typed shortcut
    const lower = raw.toLowerCase();
    if (lower.includes('emergency') || raw.startsWith('🚨')) {
      await sendToBackend(raw, file);
      showBotMessage('⚠️ Connecting you to emergency support…', true);
      window.location.href = 'tel:5203332121';
      input.value=''; fileInput.value='';
      return;
    }

    if (!raw && !file) return;

    // Render user msg
    const userMsg = document.createElement('div');
    userMsg.className = 'pipepal-msg pipepal-user';
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        userMsg.innerHTML = `<img src="${e.target.result}" style="max-width:100%;border-radius:8px;"><br>${raw||''}`;
        body.appendChild(userMsg);
        persistMessage('user', userMsg.innerHTML);
      };
      reader.readAsDataURL(file);
    } else {
      userMsg.textContent = raw;
      body.appendChild(userMsg);
      persistMessage('user', raw);
    }

    // Kick off fetch
    typing.style.display = 'block';
    await sendToBackend(raw, file);

    input.value=''; fileInput.value='';
  }

  // Backend fetch + display
  async function sendToBackend(msg, file) {
    try {
      console.log('🚀 Sending to n8n…', {msg, file});
      const formData = new FormData();
      if (msg)  formData.append('message', msg);
      if (file) formData.append('imageFile', file);
      formData.append('context', JSON.stringify(context));

      const res  = await fetch('https://ganzy88.app.n8n.cloud/webhook/pipepal-sosy',{
        method:'POST', body:formData
      });
      console.log('⬅️ Response status:', res.status);

      const text = await res.text();
      console.log('⬅️ Raw response text:', text);

      let data = {};
      if (text) {
        try { data = JSON.parse(text); }
        catch {/* non-JSON fallback */}
      }

      // unwrap single-array
      if (Array.isArray(data) && data.length) data = data[0];

      console.log('⬅️ Parsed:', data);
      updateContext(data);

      // pick reply
      const replyText =
        data.reply ||
        data['Image Analysis'] ||
        data.customerMessage ||
        data.result ||
        data.message?.content?.response ||
        data.message?.content ||
        (data.choices?.[0]?.message?.content?.response ||
         data.choices?.[0]?.message?.content) ||
        '';

      if (replyText) {
        const isHTML = /<[^>]+>/.test(replyText);
        showBotMessage(replyText, isHTML);
      } else {
        showBotMessage('Sorry, something went wrong.', false);
      }
    }
    catch(err) {
      console.error('❌ sendToBackend error:', err);
      showBotMessage('🚨 System Error. Call (520) 333-2121.', true);
    }
    finally {
      typing.style.display = 'none';
      body.scrollTo({top:body.scrollHeight,behavior:'smooth'});
    }
  }

  // keep track of context fields
  function updateContext(data) {
    ['IntentName','RequestedService','Name','Email','CustomerID']
      .forEach(key => (data[key] && (context[key]=data[key])));
  }
}

// expose
window.initPipepal = initPipepal;
