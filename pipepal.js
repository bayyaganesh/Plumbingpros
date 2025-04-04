document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("pipepal-toggle");
  const chat = document.getElementById("pipepal-chat");
  const close = document.getElementById("pipepal-close");
  const messages = document.getElementById("pipepal-messages");
  const input = document.getElementById("pipepal-user-input");

  const sessionState = sessionStorage.getItem("pipepal-open");
  if (sessionState === "true") {
    chat.classList.add("visible");
  }

  toggle.onclick = () => {
    chat.classList.toggle("visible");
    sessionStorage.setItem("pipepal-open", chat.classList.contains("visible"));
  };

  close.onclick = () => {
    chat.classList.remove("visible");
    sessionStorage.setItem("pipepal-open", false);
  };

  function showTypingAnimation() {
    const typingEl = document.createElement("div");
    typingEl.id = "pipepal-typing";
    typingEl.innerHTML = `<em>PipePal is typing<span class="dot one">.</span><span class="dot two">.</span><span class="dot three">.</span></em>`;
    messages.appendChild(typingEl);
    scrollToBottom();
    return typingEl;
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function openCalendarPopup() {
    const calendar = document.getElementById("pipepal-calendar-popup");
    if (calendar) calendar.style.display = "block";
  }

  function closeCalendarPopup() {
    const calendar = document.getElementById("pipepal-calendar-popup");
    if (calendar) calendar.style.display = "none";
  }

  // ✅ Handles direct booking from calendar
  window.submitAppointment = function () {
    const selectedTime = document.getElementById("appointmentTime").value;
    if (!selectedTime) return;

    const userMessage = `I would like to book this time: ${selectedTime}`;
    messages.innerHTML += `<div><strong>You:</strong> ${userMessage}</div>`;
    scrollToBottom();
    closeCalendarPopup();

    fetch("https://ganeshbabubayya.app.n8n.cloud/webhook/pipepal-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Guest",
        email: "guest@example.com",
        message: userMessage,
        selected_time: selectedTime,
        page_url: window.location.href,
        utm_source: "calendar"
      })
    })
    .then((res) => res.json())
    .then((data) => {
      let reply = data.reply || "Thanks! We've received your booking.";
      try {
        const parsed = typeof reply === "string" ? JSON.parse(reply) : reply;
        reply = parsed.reply || reply;
      } catch (e) {}
      messages.innerHTML += `<div><strong>PipePal:</strong> ${reply}</div>`;
      scrollToBottom();
    })
    .catch(() => {
      messages.innerHTML += `<div><strong>PipePal:</strong> Sorry, something went wrong while booking.</div>`;
      scrollToBottom();
    });
  };

  async function handleSend() {
    const msg = input.value.trim();
    if (!msg) return;

    messages.innerHTML += `<div><strong>You:</strong> ${msg}</div>`;
    input.value = "";
    scrollToBottom();

    const typingEl = showTypingAnimation();

    try {
      const res = await fetch("https://ganeshbabubayya.app.n8n.cloud/webhook/pipepal-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Guest", email: "guest@example.com", message: msg })
      });

      const data = await res.json();
      typingEl.remove();

      let reply = data.reply || "Thanks for reaching out!";
      try {
        const parsed = typeof reply === "string" ? JSON.parse(reply) : reply;

        if (parsed.show_calendar) {
          openCalendarPopup();
        }

        if (parsed.reply) {
          reply = parsed.reply;
        }
      } catch (e) {
        // not JSON
      }

      messages.innerHTML += `<div><strong>PipePal:</strong> ${reply}</div>`;
    } catch (err) {
      typingEl.remove();
      messages.innerHTML += `<div><strong>PipePal:</strong> Sorry, something went wrong.</div>`;
    }

    scrollToBottom();
  }

  document.getElementById("pipepal-send").onclick = handleSend;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  });

  document.getElementById("pipepal-submit").onclick = async () => {
    const name = document.getElementById("pipepal-name").value;
    const email = document.getElementById("pipepal-email").value;
    const message = document.getElementById("pipepal-message").value;

    if (!name || !email || !message) {
      alert("Please fill out all fields");
      return;
    }

    try {
      await fetch("https://ganeshbabubayya.app.n8n.cloud/webhook/pipepal-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message })
      });

      alert("🎉 Thank you! We'll get back to you soon.");
      document.getElementById("pipepal-name").value = "";
      document.getElementById("pipepal-email").value = "";
      document.getElementById("pipepal-message").value = "";
    } catch (err) {
      alert("Error submitting details. Please try again.");
    }
  };
});
