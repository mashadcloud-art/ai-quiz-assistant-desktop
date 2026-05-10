const STREAM_API = '/api/assistant/stream';

let currentMode     = 'chat';
let currentProvider = 'groq';
let history         = [];
let abortController = null;

const messagesEl     = document.getElementById('messages');
const promptInput    = document.getElementById('prompt-input');
const sendBtn        = document.getElementById('send-btn');
const stopBtn        = document.getElementById('stop-btn');
const modeBanner     = document.getElementById('mode-banner');
const providerSelect = document.getElementById('provider-select');
const modelSelect    = document.getElementById('model-select');

// ── Provider → model list ─────────────────────────────────────────────────────
const PROVIDER_MODELS = {
  groq:       ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  gemini:     ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-8b'],
  openrouter: [
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemma-2-9b-it:free',
    'microsoft/phi-3-mini-128k-instruct:free',
    'qwen/qwen-2-7b-instruct:free',
  ],
  claude:     ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  grok:       ['grok-beta', 'grok-2'],
  deepinfra:  ['meta-llama/Meta-Llama-3.1-8B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  cerebras:   ['llama3.1-8b', 'llama3.1-70b'],
  sambanova:  ['Meta-Llama-3.1-8B-Instruct', 'Meta-Llama-3.1-70B-Instruct'],
  ollama:     ['phi3:latest', 'llama3:latest'],
};

const PROVIDER_LABELS = {
  groq:       '⚡ Groq',
  gemini:     '🔷 Gemini',
  openrouter: '🌐 OpenRouter',
  claude:     '🧠 Claude',
  grok:       '🐦 Grok',
  deepinfra:  '🔩 DeepInfra',
  cerebras:   '⚡ Cerebras',
  sambanova:  '🚀 SambaNova',
  ollama:     '🦙 Ollama',
};

function populateModels(provider) {
  const models = PROVIDER_MODELS[provider] ?? [];
  modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
}

// Init model list for default provider
populateModels(currentProvider);

// ── Provider switching ────────────────────────────────────────────────────────
providerSelect.addEventListener('change', () => {
  currentProvider = providerSelect.value;
  history = [];
  populateModels(currentProvider);
  addMessage('assistant',
    `Switched to ${PROVIDER_LABELS[currentProvider]}. History cleared.\n` +
    `Model: ${modelSelect.value}`
  );
});

// ── Mode switching ────────────────────────────────────────────────────────────
const modeLabels = {
  chat:              '💬 Chat',
  study:             '📚 Study Coach',
  quiz:              '🧠 Quiz Generator',
  summary:           '📄 Summarizer',
  negotiation_coach: '🤝 Negotiation Coach',
};

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    modeBanner.textContent = modeLabels[currentMode];
    history = [];
    addMessage('assistant', `Switched to ${modeLabels[currentMode]} mode. History cleared.`);
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────────
document.getElementById('clear-btn').addEventListener('click', () => {
  history = [];
  messagesEl.innerHTML = '';
  addMessage('assistant', 'Chat cleared. Ask me anything.');
});

// ── Stop ──────────────────────────────────────────────────────────────────────
function setStreaming(active) {
  sendBtn.style.display = active ? 'none' : '';
  stopBtn.style.display = active ? ''     : 'none';
  promptInput.disabled  = active;
}

stopBtn.addEventListener('click', () => {
  if (abortController) abortController.abort();
});

// ── Enter to send ─────────────────────────────────────────────────────────────
promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);

// ── Send ──────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  promptInput.value = '';
  setStreaming(true);
  addMessage('user', prompt);

  const assistantMsg = createEmptyAssistantBubble();
  const bubble       = assistantMsg.querySelector('.bubble');
  bubble.textContent = '▍';

  let fullReply = '';
  abortController  = new AbortController();

  try {
    const res = await fetch(STREAM_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        mode:     currentMode,
        history,
        model:    modelSelect.value,
        provider: currentProvider,
      }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      bubble.textContent = `⚠️ ${data.error ?? 'Server error'}`;
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let parsed;
        try { parsed = JSON.parse(line.slice(6)); } catch { continue; }

        if (parsed.error) { bubble.textContent = `⚠️ ${parsed.error}`; return; }

        if (parsed.token) {
          fullReply += parsed.token;
          bubble.textContent = fullReply + '▍';
          scrollToBottom();
        }

        if (parsed.done) {
          bubble.textContent = fullReply;
          if (currentMode === 'quiz') { assistantMsg.remove(); renderQuiz(fullReply); }
          history.push({ role: 'user',      content: prompt    });
          history.push({ role: 'assistant', content: fullReply });
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      bubble.textContent = fullReply ? fullReply + ' [stopped]' : '[stopped]';
      if (fullReply) {
        history.push({ role: 'user',      content: prompt    });
        history.push({ role: 'assistant', content: fullReply });
      }
    } else {
      bubble.textContent = '⚠️ Could not reach the server.';
    }
  } finally {
    abortController = null;
    setStreaming(false);
    promptInput.focus();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function addMessage(role, text) {
  const msg    = document.createElement('div');
  msg.className = `msg ${role}`;
  const bubble  = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  scrollToBottom();
  return msg;
}

function createEmptyAssistantBubble() {
  const msg    = document.createElement('div');
  msg.className = 'msg assistant';
  const bubble  = document.createElement('div');
  bubble.className = 'bubble';
  msg.appendChild(bubble);
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
  try { questions = JSON.parse(raw); } catch {
    addMessage('assistant', raw);
    return;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    addMessage('assistant', 'No questions generated. Try a more specific topic.');
    return;
  }

  const wrapper   = document.createElement('div');
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

    const expEl = document.createElement('div');
    expEl.className = 'explanation';
    expEl.textContent = `✅ ${q.answer} — ${q.explanation}`;

    (q.options ?? []).forEach(opt => {
      const btn = document.createElement('div');
      btn.className = 'option';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        optsEl.querySelectorAll('.option').forEach(o => o.style.pointerEvents = 'none');
        const chosen = opt.trim()[0];
        if (chosen === q.answer) {
          btn.classList.add('correct');
        } else {
          btn.classList.add('wrong');
          optsEl.querySelectorAll('.option').forEach(o => {
            if (o.textContent.trim()[0] === q.answer) o.classList.add('correct');
          });
        }
        expEl.classList.add('show');
      });
      optsEl.appendChild(btn);
    });

    card.appendChild(optsEl);
    card.appendChild(expEl);
    container.appendChild(card);
  });

  wrapper.appendChild(container);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}
