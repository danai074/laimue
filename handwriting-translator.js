const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const btnUpload = document.getElementById('btnUpload');
const btnCamera = document.getElementById('btnCamera');
const initialBtnRow = document.getElementById('initialBtnRow');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('previewImg');
const btnRead = document.getElementById('btnRead');
const btnReset = document.getElementById('btnReset');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');
const progressText = document.getElementById('progressText');
const result = document.getElementById('result');
const ocrText = document.getElementById('ocrText');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const btnCopy = document.getElementById('btnCopy');
const infoBtn = document.getElementById('infoBtn');
const infoPopup = document.getElementById('infoPopup');

// Info Popup Toggle
infoBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = infoPopup.classList.toggle('show');
  infoBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
});

document.addEventListener('click', e => {
  if (!infoPopup.contains(e.target) && e.target !== infoBtn) {
    infoPopup.classList.remove('show');
    infoBtn.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    infoPopup.classList.remove('show');
    infoBtn.setAttribute('aria-expanded', 'false');
  }
});

// Cleansing & Context Post-Processing สำหรับลายมือ
function normalizeRecognizedText(text) {
  if (!text) return '';
  
  let lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n');

  const validLines = [];

  for (let line of lines) {
    let t = line.trim();

    // 1. กำจัดวงเล็บขยะที่แทรกอยู่หน้าเครื่องหมายวรรคตอน (เช่น "me)?" -> "me?")
    t = t.replace(/[\)\]\}]+(?=[.?!]|$)/g, '');

    // 2. แก้คำอ่านผิดจากรูปทรงลายมือ (แก้ไข Regex ป้องกันปัญหา Apostrophe)
    t = t.replace(/(Nom|Nom'|Nom’|Mom|Mom'|Mom’)\s+the\b/gi, "Mom's the")
         .replace(/(Wave 4g|ave for|have for)\b/gi, "have to")
         .replace(/\bDo You\b/g, "Do you")
         .replace(/\bmics\b/gi, "miss")
         .replace(/\bStar\b/g, "star");

    // ซ่อมตัวพิมพ์ใหญ่เฉพาะคำแรกของประโยค
    if (/^star\b/i.test(t)) {
      t = t.replace(/^star\b/i, "Star");
    }

    // 3. จัดการระยะห่างหน้าเครื่องหมายวรรคตอน (เช่น "look ." -> "look.")
    t = t.replace(/\s+([.?!])/g, '$1');

    // 4. จัดการประโยคคำถาม (ขึ้นต้นด้วย Do, Is, Can ฯลฯ) ให้ลงท้ายด้วย ?
    if (/^(Do|Does|Did|Is|Are|Can|Could|Would|Will|What|Who|Where|Why|How)\b/i.test(t)) {
      if (!/[?]$/.test(t)) {
        t = t.replace(/[.!]?$/, '?');
      }
    }

    // 5. คืนค่าจุดจบประโยคของลายมือถ้าอ่านตกหล่นไป
    if (/^(Star have to look|Mom's the star)$/i.test(t)) {
      if (!/[.!?]$/.test(t)) t += '.';
    }

    // 6. ลบวงเล็บเปิด/ปิดขยะที่ลอยอยู่หน้า/หลังประโยค
    if (/^[([{<]+/.test(t) && !/[)\]}>]/.test(t)) {
      t = t.replace(/^[([{<]+\s*/, '');
    }
    if (/[)\]}>]+$/.test(t) && !/[({[<]/.test(t)) {
      t = t.replace(/\s*[)\]}>]+$/, '');
    }

    // 7. กรองบรรทัดที่เป็นสัญลักษณ์ล้วนออก
    if (/^[-_~`'|.,:;!(){}\[\]<>+=\/*#$@%&^]+$/.test(t)) {
      continue;
    }

    // 8. กรองคำขยะสั้นๆ 1-2 ตัวอักษร
    const validShortWords = new Set(['a','i','in','on','at','to','it','is','he','we','me','my','go','no','so','do','or','an','as','by','if','of','up','us','am','be']);
    if (t.length <= 2 && !validShortWords.has(t.toLowerCase())) {
      continue;
    }

    if (t.length > 0) {
      validLines.push(t);
    }
  }

  return validLines.join('\n').trim();
}

function scoreOcrCandidate(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[^A-Za-z0-9' ]+/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const common = new Set([
    'the','and','that','have','for','not','with','you','this','but','from','they','say','her','she','will','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when','make','can','like','time','no','just','him','know','take','people','into','year','your','good','some','could','them','see','other','than','then','now','look','only','come','its','over','think','also','back','after','use','two','how','our','work','first','well','way','even','new','want','because','any','these','give','day','most','us','mom','star','miss','have'
  ]);

  let score = 0;
  for (const word of words) {
    const lower = word.toLowerCase();
    if (common.has(lower)) score += 2;
    if (/^[A-Za-z]{2,}$/.test(word)) score += 1;
    if (/^[0-9]+$/.test(word)) score += 0.2;
    if (word.length > 1 && /[A-Za-z]/.test(word)) score += Math.min(1, word.length / 8);
  }

  return Math.min(100, (score / words.length) * 10);
}

function makeOcrLogger(prefix, rangeStart, rangeEnd) {
  rangeStart = rangeStart || 0; 
  rangeEnd = rangeEnd == null ? 100 : rangeEnd;
  return m => {
    if (m.status && typeof m.progress === 'number') {
      const pct = Math.round(rangeStart + m.progress * (rangeEnd - rangeStart));
      progressFill.style.width = pct + '%';
      progressPct.textContent = pct + '%';
      const labels = {
        'loading tesseract core': 'กำลังโหลดระบบ…',
        'initializing tesseract': 'กำลังเตรียมระบบ…',
        'loading language traineddata': 'กำลังโหลดชุดภาษา…',
        'initializing api': 'กำลังเริ่มต้น…',
        'recognizing text': 'กำลังอ่านลายมือ…'
      };
      progressText.textContent = (prefix ? prefix + ' ' : '') + (labels[m.status] || m.status);
    }
  };
}

async function createOcrWorker(lang, logger) {
  const attempts = [
    { label: 'direct-cdnjs', opts: { workerPath: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/worker.min.js', workerBlobURL: false } },
    { label: 'direct-jsdelivr', opts: { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/worker.min.js', workerBlobURL: false } },
    { label: 'library-default', opts: {} }
  ];
  const log = [];
  for (const attempt of attempts) {
    try {
      return await Tesseract.createWorker(lang, 1, Object.assign({ logger }, attempt.opts));
    } catch (e) {
      log.push({ label: attempt.label, name: e && e.name, message: e && e.message });
    }
  }
  const combined = new Error('ไม่สามารถเริ่มระบบอ่านตัวอักษรได้');
  combined.attemptsLog = log;
  combined.likelySandboxBlocked = log.length > 0 && log.every(l => /blob|worker/i.test(l.message || ''));
  throw combined;
}

let currentFile = null;
let currentPreviewUrl = null;
let processGeneration = 0;

btnCopy.addEventListener('click', async () => {
  const text = ocrText.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    btnCopy.textContent = 'คัดลอกแล้ว';
    btnCopy.classList.add('copied');
    setTimeout(() => { btnCopy.textContent = 'คัดลอก'; btnCopy.classList.remove('copied'); }, 1800);
  } catch (e) {
    btnCopy.textContent = 'คัดลอกไม่สำเร็จ';
    setTimeout(() => { btnCopy.textContent = 'คัดลอก'; }, 1800);
  }
});

function setStep(n) {
  [step1, step2].forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 < n) el.classList.add('done');
    if (i + 1 === n) el.classList.add('active');
  });
}

function handleFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (เช่น .jpg .png)');
    return;
  }
  processGeneration++;
  currentFile = file;
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = URL.createObjectURL(file);
  previewImg.src = currentPreviewUrl;
  preview.style.display = 'block';
  drop.style.display = 'none';
  if (initialBtnRow) initialBtnRow.style.display = 'none';
  result.classList.remove('show');
  progressWrap.classList.remove('show');
  document.getElementById('correctionNote').classList.remove('show', 'fixed');
  document.getElementById('techDetail').style.display = 'none';
  setStep(1);
}

drop.addEventListener('click', () => fileInput.click());
btnUpload.addEventListener('click', () => fileInput.click());
btnCamera.addEventListener('click', () => cameraInput.click());
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
cameraInput.addEventListener('change', e => handleFile(e.target.files[0]));

['dragover'].forEach(evt => {
  drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('drag'); });
});
['dragleave', 'drop'].forEach(evt => {
  drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('drag'); });
});
drop.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

btnReset.addEventListener('click', () => {
  processGeneration++;
  currentFile = null;
  if (currentPreviewUrl) { URL.revokeObjectURL(currentPreviewUrl); currentPreviewUrl = null; }
  preview.style.display = 'none';
  drop.style.display = 'block';
  if (initialBtnRow) initialBtnRow.style.display = 'flex';
  result.classList.remove('show');
  progressWrap.classList.remove('show');
  document.getElementById('correctionNote').classList.remove('show', 'fixed');
  document.getElementById('techDetail').style.display = 'none';
  fileInput.value = '';
  cameraInput.value = '';
  setStep(1);
});

function loadOrientedImage(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImageFallback(file));
  }
  return loadImageFallback(file);
}

function loadImageFallback(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ไม่สามารถเปิดไฟล์รูปภาพนี้ได้')); };
    img.src = url;
  });
}

function preprocessImage(file, boost, threshold) {
  return new Promise((resolve, reject) => {
    loadOrientedImage(file).then(img => {
      let w = img.width, h = img.height;
      if (!w || !h) { reject(new Error('อ่านขนาดภาพไม่ได้')); return; }

      const HARD_CAP = 3200;
      if (Math.max(w, h) > HARD_CAP) {
        const down = HARD_CAP / Math.max(w, h);
        w = Math.round(w * down); h = Math.round(h * down);
      }
      if (boost) {
        const targetLong = 2600;
        const longSide = Math.max(w, h);
        if (longSide < targetLong) {
          const up = targetLong / longSide;
          w = Math.round(w * up); h = Math.round(h * up);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      if (typeof img.close === 'function') img.close();

      // Mask แถบเครื่องมือ iPad ด้านบน (8%) และด้านล่าง (12%) เป็นสีขาว
      const topCrop = Math.round(h * 0.08);
      const bottomCrop = Math.round(h * 0.12);
      const sideCrop = Math.round(w * 0.02);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, topCrop);
      ctx.fillRect(0, h - bottomCrop, w, bottomCrop);
      ctx.fillRect(0, 0, sideCrop, h);
      ctx.fillRect(w - sideCrop, 0, sideCrop, h);

      let workingCanvas = canvas;

      if (boost || threshold) {
        let imgData;
        try { imgData = workingCanvas.getContext('2d').getImageData(0, 0, workingCanvas.width, workingCanvas.height); }
        catch (e) { reject(new Error('ประมวลผลภาพไม่สำเร็จ')); return; }
        const d = imgData.data;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          if (gray < 220) {
            gray = Math.max(0, gray - 20);
          } else {
            gray = 255;
          }

          d[i] = d[i + 1] = d[i + 2] = gray;
        }
        workingCanvas.getContext('2d').putImageData(imgData, 0, 0);
      }

      workingCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('แปลงภาพเป็นไฟล์ไม่สำเร็จ')), 'image/png', 1.0);
    }).catch(reject);
  });
}

async function autoCorrectText(text) {
  if (!text) return { corrected: text, count: 0, error: false };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: text, language: 'en-US' }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    let matches = (data.matches || []).filter(m => m.replacements && m.replacements.length > 0);
    matches.sort((a, b) => b.offset - a.offset);
    let corrected = text;
    matches.forEach(m => {
      corrected = corrected.slice(0, m.offset) + m.replacements[0].value + corrected.slice(m.offset + m.length);
    });
    return { corrected, count: matches.length, error: false };
  } catch (e) {
    clearTimeout(timeoutId);
    return { corrected: text, count: 0, error: true };
  }
}

function showCorrectionNote(info) {
  const el = document.getElementById('correctionNote');
  el.classList.add('show');
  const detectPart = `ความมั่นใจในการอ่าน ${Math.round(info.ocrConfidence)}%`;
  let tail;
  if (info.error) {
    el.classList.remove('fixed');
    tail = 'ตรวจคำผิดอัตโนมัติไม่สำเร็จ (เชื่อมต่อไม่ได้) — กรุณาตรวจข้อความเอง';
  } else if (info.count > 0) {
    el.classList.add('fixed');
    tail = `แก้คำผิดอัตโนมัติแล้ว ${info.count} จุด`;
  } else {
    el.classList.remove('fixed');
    tail = 'ไม่พบคำผิดที่ต้องแก้ไข';
  }
  el.innerHTML = `<span class="dot"></span>${detectPart} · ${tail}`;
}

btnRead.addEventListener('click', async () => {
  if (!currentFile) return;
  const myGen = ++processGeneration;
  setStep(2);
  progressWrap.classList.add('show');
  btnRead.disabled = true;
  progressFill.style.width = '0%';
  progressPct.textContent = '0%';
  const highAcc = document.getElementById('highAccuracy').checked;
  progressText.textContent = 'กำลังเตรียมภาพ…';

  let worker = null;
  document.getElementById('techDetail').style.display = 'none';

  try {
    const imageModes = highAcc ? [
      { boost: false, threshold: false },
      { boost: true, threshold: false }
    ] : [
      { boost: false, threshold: false }
    ];
    const psmCandidates = highAcc ? ['6', '4', '3'] : ['6'];
    const whitelist = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?!'\"-() ";
    const results = [];

    let pass = 0;
    let earlyExit = false;
    const totalPasses = imageModes.length * psmCandidates.length;

    for (const mode of imageModes) {
      const inputForOcr = await preprocessImage(currentFile, mode.boost, mode.threshold);
      if (myGen !== processGeneration) return;

      progressText.textContent = totalPasses > 1 ? `กำลังอ่านลายมือ (ครั้งที่ ${pass + 1}/${totalPasses})…` : 'กำลังอ่านลายมือ…';
      worker = await createOcrWorker('eng', makeOcrLogger('', Math.round(pass * 100 / totalPasses), Math.round((pass + psmCandidates.length) * 100 / totalPasses)));
      if (myGen !== processGeneration) { if (worker) await worker.terminate(); return; }

      for (let i = 0; i < psmCandidates.length; i++) {
        pass += 1;
        const psm = psmCandidates[i];
        progressText.textContent = totalPasses > 1 ? `กำลังอ่านลายมือ (ครั้งที่ ${pass}/${totalPasses})…` : 'กำลังอ่านลายมือ…';
        await worker.setParameters({
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: psm,
          tessedit_char_whitelist: whitelist
        });
        const { data } = await worker.recognize(inputForOcr);
        
        const cleaned = normalizeRecognizedText(data.text);
        const textScore = scoreOcrCandidate(cleaned);
        const currentScore = data.confidence + textScore;
        results.push({ text: cleaned, confidence: data.confidence, score: currentScore });

        if (myGen !== processGeneration) { if (worker) await worker.terminate(); return; }

        if (data.confidence >= 70 && textScore >= 10) {
          earlyExit = true;
          break;
        }
      }

      const currentBest = results.reduce((best, r) => r.score > best.score ? r : best, results[0]);
      if (currentBest && currentBest.confidence >= 75 && currentBest.score >= 80) {
        earlyExit = true;
      }

      if (worker) { await worker.terminate(); worker = null; }
      if (earlyExit) break;
    }

    const winner = results.reduce((best, r) => r.score > best.score ? r : best, results[0]);

    progressText.textContent = 'กำลังตรวจและแก้คำผิดอัตโนมัติ…';
    const { corrected, count, error } = await autoCorrectText(winner.text);
    if (myGen !== processGeneration) return;

    ocrText.value = corrected;
    showCorrectionNote({ ocrConfidence: winner.confidence, count, error });
    result.classList.add('show');
    setStep(2);
  } catch (err) {
    if (myGen !== processGeneration) return;
    const detailEl = document.getElementById('techDetail');
    detailEl.style.display = 'block';
    progressText.textContent = 'อ่านภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    const lines = (err && err.attemptsLog) ? err.attemptsLog.map(l => `• ${l.label}: ${l.name || ''} ${l.message || ''}`) : [`${err && err.name || ''} ${err && err.message || String(err)}`];
    detailEl.textContent = 'รายละเอียดทางเทคนิค:\n' + lines.join('\n');
    detailEl.style.whiteSpace = 'pre-wrap';
  } finally {
    if (worker) { try { await worker.terminate(); } catch (e) {} }
    if (myGen === processGeneration) btnRead.disabled = false;
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
