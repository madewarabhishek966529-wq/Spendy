// ============================================================================
// Spendy — Voice Expense Entry
// Records a short clip via MediaRecorder, sends it to the transcribe-voice
// Edge Function (OpenAI Speech-to-Text + GPT-5 field extraction), then opens
// the transaction modal pre-filled so the user can confirm before saving.
// Example: "I spent 250 rupees on lunch today" -> pre-filled expense form.
// ============================================================================

import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { icons } from '../utils/icons.js';
import { transcribeVoiceEntry } from '../services/aiService.js';
import { openTransactionModal } from './transactionModal.js';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function openVoiceEntry({ userId, onSaved }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast.error('Voice entry needs microphone access, which this browser does not support.');
    return;
  }

  const bodyHTML = `
    <div class="voice-entry">
      <button type="button" class="voice-record-btn" id="voice-record-btn" aria-label="Record">
        ${icons.mic}
      </button>
      <p class="voice-status" id="voice-status">Tap the mic and say something like "I spent 250 on lunch today".</p>
      <p class="voice-timer u-hidden" id="voice-timer">0:00</p>
    </div>
  `;

  const { dialog } = openModal({ title: 'Add by voice', bodyHTML });
  const recordBtn = dialog.querySelector('#voice-record-btn');
  const statusEl = dialog.querySelector('#voice-status');
  const timerEl = dialog.querySelector('#voice-timer');

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let seconds = 0;
  let timerInterval = null;
  let state = 'idle'; // idle -> recording -> processing

  function stopStreamTracks() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Microphone permission was denied.');
      return;
    }

    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    state = 'recording';
    recordBtn.classList.add('is-recording');
    statusEl.textContent = 'Listening… tap again to stop.';
    timerEl.classList.remove('u-hidden');
    seconds = 0;
    timerEl.textContent = '0:00';
    timerInterval = setInterval(() => {
      seconds += 1;
      timerEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds >= 30) stopRecording(); // hard cap so clips stay small
    }, 1000);
  }

  function stopRecording() {
    clearInterval(timerInterval);
    mediaRecorder?.stop();
    stopStreamTracks();
  }

  async function handleStop() {
    if (chunks.length === 0) {
      statusEl.textContent = 'No audio captured — tap the mic to try again.';
      recordBtn.classList.remove('is-recording');
      state = 'idle';
      return;
    }

    state = 'processing';
    recordBtn.classList.remove('is-recording');
    recordBtn.disabled = true;
    statusEl.textContent = 'Transcribing and extracting details…';

    try {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const base64 = await blobToBase64(blob);
      const result = await transcribeVoiceEntry(base64, blob.type);

      closeModal();
      toast.success(`Heard: "${result.transcript}"`);
      openTransactionModal({
        userId,
        prefill: {
          type: result.type,
          title: result.title,
          amount: result.amount,
          category: result.category,
          source: result.source,
          date: result.date,
          description: result.description,
        },
        onSaved,
      });
    } catch (err) {
      console.error('[Spendy] Voice entry failed:', err.message);
      statusEl.textContent = 'Something went wrong. Tap the mic to try again.';
      toast.error(err.message || 'Could not process that recording.');
      recordBtn.disabled = false;
      state = 'idle';
    }
  }

  recordBtn.addEventListener('click', () => {
    if (state === 'idle') startRecording();
    else if (state === 'recording') stopRecording();
  });
}
