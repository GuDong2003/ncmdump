import { decodeNcmData, describeTrack } from "./ncm-core.mjs";

const fileInput = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const clearButton = document.querySelector("#clear-results");
const processedCount = document.querySelector("#processed-count");
const successCount = document.querySelector("#success-count");
const errorCount = document.querySelector("#error-count");

const activeUrls = new Set();
const counters = {
  processed: 0,
  success: 0,
  error: 0,
};

function wordArrayFromUint8(bytes) {
  const words = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] |= bytes[index] << (24 - (index % 4) * 8);
  }

  return window.CryptoJS.lib.WordArray.create(words, bytes.length);
}

function uint8FromWordArray(wordArray) {
  const { words, sigBytes } = wordArray;
  const bytes = new Uint8Array(sigBytes);

  for (let index = 0; index < sigBytes; index += 1) {
    bytes[index] = (words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
  }

  return bytes;
}

async function aesEcbDecrypt(keyBytes, dataBytes) {
  if (!window.CryptoJS) {
    throw new Error("CryptoJS failed to load.");
  }

  const key = wordArrayFromUint8(keyBytes);
  const ciphertext = wordArrayFromUint8(dataBytes);
  const decrypted = window.CryptoJS.AES.decrypt(
    { ciphertext },
    key,
    {
      mode: window.CryptoJS.mode.ECB,
      padding: window.CryptoJS.pad.Pkcs7,
    },
  );

  return uint8FromWordArray(decrypted);
}

function setStatus(message, tone = "muted") {
  status.textContent = message;
  status.classList.remove("is-error", "is-success");
  if (tone === "error") {
    status.classList.add("is-error");
  } else if (tone === "success") {
    status.classList.add("is-success");
  }
}

function updateCounters() {
  processedCount.textContent = String(counters.processed);
  successCount.textContent = String(counters.success);
  errorCount.textContent = String(counters.error);
}

function revokeActiveUrls() {
  for (const url of activeUrls) {
    URL.revokeObjectURL(url);
  }
  activeUrls.clear();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  activeUrls.add(url);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

function formatBytes(size) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(durationMs) {
  if (!durationMs) {
    return "未知时长";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBitrate(bitrate) {
  if (!bitrate) {
    return "未知码率";
  }

  return `${Math.round(bitrate / 1000)} kbps`;
}

function emptyResults() {
  results.innerHTML = `
    <div class="empty-state">
      <p>还没有解码结果</p>
      <span>把 NCM 文件拖进投递区，页面会在浏览器里本地解码，并生成可下载的结果卡片。</span>
    </div>
  `;
}

function makeFact(labelText, valueText) {
  const fact = document.createElement("div");
  fact.className = "fact-card";

  const label = document.createElement("span");
  label.className = "fact-label";
  label.textContent = labelText;

  const value = document.createElement("span");
  value.className = "fact-value";
  value.textContent = valueText;

  fact.append(label, value);
  return fact;
}

function appendResultCard(result, summary) {
  const card = document.createElement("article");
  card.className = "result-card";

  const top = document.createElement("div");
  top.className = "result-top";

  const copy = document.createElement("div");
  const fileTag = document.createElement("span");
  fileTag.className = "file-tag";
  fileTag.textContent = summary.format;

  const title = document.createElement("h3");
  title.className = "result-title";
  title.textContent = summary.title;

  const subtitle = document.createElement("p");
  subtitle.className = "result-subtitle";
  subtitle.textContent = `${summary.artist} - ${summary.album}`;

  copy.append(fileTag, title, subtitle);

  const meta = document.createElement("p");
  meta.className = "result-meta";
  meta.textContent = `${formatDuration(summary.duration)} / ${formatBitrate(summary.bitrate)}`;

  top.append(copy, meta);

  const grid = document.createElement("div");
  grid.className = "result-grid";

  const coverFrame = document.createElement("div");
  coverFrame.className = "cover-frame";

  if (result.coverBytes.length > 0) {
    const coverUrl = URL.createObjectURL(new Blob([result.coverBytes], { type: result.coverMimeType }));
    activeUrls.add(coverUrl);
    const image = document.createElement("img");
    image.alt = `${summary.title} cover`;
    image.src = coverUrl;
    coverFrame.appendChild(image);
  } else {
    const noCover = document.createElement("span");
    noCover.textContent = "No cover";
    coverFrame.appendChild(noCover);
  }

  const detail = document.createElement("div");
  const factGrid = document.createElement("div");
  factGrid.className = "fact-grid";

  factGrid.append(
    makeFact("来源文件", result.sourceName),
    makeFact("导出文件", result.outputName),
    makeFact("音频大小", formatBytes(result.audioBytes.length)),
    makeFact("封面状态", result.coverBytes.length > 0 ? "已提取" : "未内置"),
  );

  const audioPreview = document.createElement("audio");
  audioPreview.className = "audio-preview";
  audioPreview.controls = true;
  audioPreview.preload = "none";
  const previewUrl = URL.createObjectURL(new Blob([result.audioBytes], { type: result.audioMimeType }));
  activeUrls.add(previewUrl);
  audioPreview.src = previewUrl;

  const note = document.createElement("p");
  note.className = "result-note";
  note.textContent = "网页模式会导出可播放音频，但不会像原生 CLI 一样把标签重新写回文件内部。";

  detail.append(factGrid, audioPreview, note);

  if (result.coverBytes.length === 0) {
    const warning = document.createElement("p");
    warning.className = "result-warning";
    warning.textContent = "这首歌没有内置封面，因此只生成音频文件。";
    detail.appendChild(warning);
  }

  grid.append(coverFrame, detail);

  const actions = document.createElement("div");
  actions.className = "result-actions";

  card.append(top, grid, actions);

  const downloadAudio = document.createElement("button");
  downloadAudio.className = "download-button primary";
  downloadAudio.type = "button";
  downloadAudio.textContent = `下载 ${summary.format}`;
  downloadAudio.addEventListener("click", () => {
    downloadBlob(new Blob([result.audioBytes], { type: result.audioMimeType }), result.outputName);
  });
  actions.appendChild(downloadAudio);

  if (result.coverBytes.length > 0) {
    const downloadCover = document.createElement("button");
    downloadCover.className = "download-button secondary";
    downloadCover.type = "button";
    downloadCover.textContent = "下载封面";
    downloadCover.addEventListener("click", () => {
      downloadBlob(new Blob([result.coverBytes], { type: result.coverMimeType }), result.coverName);
    });
    actions.appendChild(downloadCover);
  }

  results.appendChild(card);
}

async function processFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".ncm"));
  if (files.length === 0) {
    setStatus("请选择至少一个 .ncm 文件。", "error");
    return;
  }

  if (results.querySelector(".empty-state")) {
    results.innerHTML = "";
  }

  setStatus(`收到 ${files.length} 个文件，开始本地解码。`);

  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await decodeNcmData(file.name, arrayBuffer, aesEcbDecrypt);
      appendResultCard(decoded, describeTrack(decoded));
      counters.processed += 1;
      counters.success += 1;
      updateCounters();
      setStatus(`已完成 ${counters.processed} 首，成功 ${counters.success} 首。`, "success");
    } catch (error) {
      counters.processed += 1;
      counters.error += 1;
      updateCounters();

      const card = document.createElement("article");
      card.className = "result-card";

      const top = document.createElement("div");
      top.className = "result-top";

      const topCopy = document.createElement("div");
      const tag = document.createElement("span");
      tag.className = "file-tag";
      tag.textContent = "失败";

      const title = document.createElement("h3");
      title.className = "result-title";
      title.textContent = file.name;

      topCopy.append(tag, title);
      top.appendChild(topCopy);
      card.appendChild(top);

      const message = document.createElement("p");
      message.className = "result-error";
      message.textContent = error instanceof Error ? error.message : String(error);
      card.appendChild(message);

      results.appendChild(card);
      setStatus(`已处理 ${counters.processed} 首，其中失败 ${counters.error} 首。`, "error");
    }
  }
}

fileInput.addEventListener("change", (event) => {
  processFiles(event.target.files);
  event.target.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === "drop") {
      processFiles(event.dataTransfer.files);
    }
    dropzone.classList.remove("is-active");
  });
});

clearButton.addEventListener("click", () => {
  revokeActiveUrls();
  counters.processed = 0;
  counters.success = 0;
  counters.error = 0;
  updateCounters();
  emptyResults();
  setStatus("已清空结果，等待新的文件。");
});

updateCounters();
emptyResults();
