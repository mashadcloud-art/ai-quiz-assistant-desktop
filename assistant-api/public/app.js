const API = '/api/assistant';

let currentMode = 'chat';
let history     = [];

const messagesEl   = document.getElementById('messages');
const promptInput  = document.getElementById('prompt-input');
const sendBtn      = document.getElementById('send-btn');
const modeBanner   = document.getElementById('mode-banner');
const modelSelect  = document.getElementById('model-select');

const modeLabels = {
  chat:               '💬 Chat',
  study:              '📚 Study Coach',
  quiz:               '🧠 Quiz Generator',
  summary:            '📄 Summarizer',
  negotiation_coach:  '🤝 Negotiation Coach',
};

// ── Mode switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    modeBanner.textContent = modeLabels[currentMode];
    history = [];  // reset history on mode change
    addMessage('assistant', `Switched to **${modeLabels[currentMode]}** mode. History cleared.`);
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────────
document.getElementById('clear-btn').addEventListener('click', () => {
  history = [];
  messagesEl.innerHTML = '';
  addMessage('assistant', 'Chat cleared. Ask me anything.');
});

// ── Send on Enter (Shift+Enter for newline) ───────────────────────────────────
promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);

// ── Send ──────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  promptInput.value = '';
  sendBtn.disabled  = true;

  addMessage('user', prompt);
  const typingEl = addTyping();

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        mode:    currentMode,
        history,
        model:   modelSelect.value,
      }),
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok) {
      addMessage('assistant', `⚠️ Error: ${data.error ?? 'Unknown error'}`);
      return;
    }

    // Save to history for multi-turn conversation
    history.push({ role: 'user',      content: prompt       });
    history.push({ role: 'assistant', content: data.reply   });

    if (currentMode === 'quiz') {
      renderQuiz(data.reply);
    } else {
      addMessage('assistant', data.reply);
    }
  } catch (err) {
    typingEl.remove();
    addMessage('assistant', '⚠️ Could not reach the server. Is the API running?');
  } finally {
    sendBtn.disabled = false;
    promptInput.focus();
  }
}

// ── Message helpers ───────────────────────────────────────────────────────────
function addMessage(role, text) {
  const msg    = document.createElement('div');
  msg.className = `msg ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  scrollToBottom();
  return msg;
}

function addTyping() {
  const msg    = document.createElement('div');
  msg.className = 'msg assistant typing';
  msg.innerHTML = '<div class="bubble">Thinking…</div>';
  messagesEl.appendChild(msg);
  scrollToBottom();
  return msg;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Quiz renderer ─────────────────────────────────────────────────────────────
function renderQuiz(raw) {
  let questions;
  try {
    questions = JSON.parse(raw);
  } catch {
    // Model didn't return valid JSON — show raw text as fallback
    addMessage('assistant', raw);
    return;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    addMessage('assistant', 'No questions were generated. Try again with a more specific topic.');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'msg assistant';

  const container = document.createElement('div');
  container.style.maxWidth = '75%';

  questions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'quiz-card';

    const qEl = document.createElement('div');
    qEl.className = 'question';
    qEl.textContent = `Q${i + 1}. ${q.question}`;
    card.appendChild(qEl);

    const optsEl = document.createElement('div');
    optsEl.className = 'options';

    (q.options ?? []).forEach(opt => {
      const btn = document.createElement('div');
      btn.className = 'option';
      btn.textContent = opt;

      const optLetter = opt.trim()[0]; // "A", "B", etc.

      btn.addEventListener('click', () => {
        // Prevent re-answering
        optsEl.querySelectorAll('.option').forEach(o => o.style.pointerEvents = 'none');

        if (optLetter === q.answer) {
          btn.classList.add('correct');
        } else {
          btn.classList.add('wrong');
          // Highlight correct answer
          optsEl.querySelectorAll('.option').forEach(o => {
            if (o.textContent.trim()[0] === q.answer) o.classList.add('correct');
          });
        }
        expEl.classList.add('show');
      });

      optsEl.appendChild(btn);
    });

    card.appendChild(optsEl);

    const expEl = document.createElement('div');
    expEl.className = 'explanation';
    expEl.textContent = `✅ ${q.answer} — ${q.explanation}`;
    card.appendChild(expEl);

    container.appendChild(card);
  });

  wrapper.appendChild(container);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}
