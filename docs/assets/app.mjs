import { decodeNcmData, describeTrack } from "./ncm-core.mjs";

const fileInput = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const clearButton = document.querySelector("#clear-results");

const activeUrls = new Set();

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
  status.style.color = tone === "error" ? "var(--danger)" : "var(--muted)";
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

function formatDuration(durationMs) {
  if (!durationMs) {
    return "Unknown length";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBitrate(bitrate) {
  if (!bitrate) {
    return "Unknown bitrate";
  }

  return `${Math.round(bitrate / 1000)} kbps`;
}

function emptyResults() {
  results.innerHTML = `
    <div class="empty-state">
      <p>No files processed yet.</p>
      <span>Try dropping one or more NCM files into the panel above.</span>
    </div>
  `;
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

  const source = document.createElement("p");
  source.className = "result-meta";
  source.textContent = `Source: ${result.sourceName}`;

  const output = document.createElement("p");
  output.className = "result-meta";
  output.textContent = `Output: ${result.outputName}`;

  const warning = document.createElement("p");
  warning.className = "result-warning";
  warning.textContent = "Browser mode decodes audio and extracts cover art, but does not rewrite tags inside the output file.";

  detail.append(source, output, warning);
  grid.append(coverFrame, detail);

  const actions = document.createElement("div");
  actions.className = "result-actions";

  card.append(top, grid, actions);

  const downloadAudio = document.createElement("button");
  downloadAudio.className = "download-button primary";
  downloadAudio.type = "button";
  downloadAudio.textContent = `Download ${summary.format}`;
  downloadAudio.addEventListener("click", () => {
    downloadBlob(new Blob([result.audioBytes], { type: result.audioMimeType }), result.outputName);
  });
  actions.appendChild(downloadAudio);

  if (result.coverBytes.length > 0) {
    const downloadCover = document.createElement("button");
    downloadCover.className = "download-button secondary";
    downloadCover.type = "button";
    downloadCover.textContent = "Download cover";
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
    setStatus("Please choose at least one .ncm file.", "error");
    return;
  }

  if (results.querySelector(".empty-state")) {
    results.innerHTML = "";
  }

  setStatus(`Processing ${files.length} file(s)...`);

  let successCount = 0;
  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await decodeNcmData(file.name, arrayBuffer, aesEcbDecrypt);
      appendResultCard(decoded, describeTrack(decoded));
      successCount += 1;
      setStatus(`Decoded ${successCount}/${files.length} file(s).`);
    } catch (error) {
      const card = document.createElement("article");
      card.className = "result-card";

      const top = document.createElement("div");
      top.className = "result-top";

      const topCopy = document.createElement("div");
      const tag = document.createElement("span");
      tag.className = "file-tag";
      tag.textContent = "Error";

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
      setStatus(`Decoded ${successCount}/${files.length} file(s), with errors.`, "error");
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
  emptyResults();
  setStatus("Waiting for files.");
});

emptyResults();
