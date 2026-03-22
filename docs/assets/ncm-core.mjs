const CORE_KEY = Uint8Array.from([
  0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f,
  0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57,
]);

const MODIFY_KEY = Uint8Array.from([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28,
]);

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAGIC_A = 0x4e455443;
const MAGIC_B = 0x4d414446;

const utf8Decoder = new TextDecoder("utf-8");

function decodeAscii(bytes) {
  return new TextDecoder("latin1").decode(bytes);
}

function decodeBase64ToBytes(input) {
  if (typeof atob === "function") {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  return Uint8Array.from(Buffer.from(input, "base64"));
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatArtists(artistField) {
  if (!Array.isArray(artistField)) {
    return "Unknown artist";
  }

  const names = artistField
    .map((entry) => Array.isArray(entry) ? entry[0] : null)
    .filter(Boolean);

  return names.length > 0 ? names.join(" / ") : "Unknown artist";
}

function stripTrailingNulls(text) {
  return text.replace(/\u0000+$/g, "").replace(/^\uFEFF/, "");
}

function sanitizeBaseName(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "decoded-track";
}

function stemFromFilename(filename) {
  return filename.replace(/\.ncm$/i, "").replace(/\.[^.]+$/u, "") || "decoded-track";
}

function buildKeyBox(key) {
  ensure(key.length > 0, "Broken NCM key data.");

  const keyBox = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) {
    keyBox[index] = index;
  }

  let lastByte = 0;
  let keyOffset = 0;
  for (let index = 0; index < 256; index += 1) {
    const swap = keyBox[index];
    const value = (swap + lastByte + key[keyOffset]) & 0xff;
    keyOffset = (keyOffset + 1) % key.length;
    keyBox[index] = keyBox[value];
    keyBox[value] = swap;
    lastByte = value;
  }

  return keyBox;
}

function decryptAudio(audioBytes, keyBox) {
  const output = audioBytes.slice();
  for (let index = 0; index < output.length; index += 1) {
    const j = (index + 1) & 0xff;
    output[index] ^= keyBox[(keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff];
  }
  return output;
}

function detectAudioFormat(audioBytes) {
  if (audioBytes.length >= 3 && audioBytes[0] === 0x49 && audioBytes[1] === 0x44 && audioBytes[2] === 0x33) {
    return "mp3";
  }

  return "flac";
}

function detectCoverMimeType(coverBytes) {
  if (coverBytes.length >= PNG_SIGNATURE.length) {
    let matches = true;
    for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
      if (coverBytes[index] !== PNG_SIGNATURE[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return "image/png";
    }
  }

  return "image/jpeg";
}

function coverExtensionFromMime(mimeType) {
  return mimeType === "image/png" ? "png" : "jpg";
}

function pickTrackName(metadata, fallbackName) {
  return sanitizeBaseName(metadata?.musicName || fallbackName);
}

function makeReader(bytes) {
  let offset = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return {
    read(length) {
      ensure(offset + length <= bytes.length, "Unexpected end of NCM file.");
      const slice = bytes.slice(offset, offset + length);
      offset += length;
      return slice;
    },
    readUint32() {
      ensure(offset + 4 <= bytes.length, "Unexpected end of NCM file.");
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    },
    skip(length) {
      ensure(offset + length <= bytes.length, "Unexpected end of NCM file.");
      offset += length;
    },
    remaining() {
      return bytes.slice(offset);
    },
  };
}

export async function decodeNcmData(filename, arrayBuffer, aesEcbDecrypt) {
  ensure(typeof aesEcbDecrypt === "function", "Missing AES decrypt helper.");

  const bytes = new Uint8Array(arrayBuffer);
  const reader = makeReader(bytes);

  ensure(reader.readUint32() === MAGIC_A && reader.readUint32() === MAGIC_B, "This file is not a valid NCM container.");
  reader.skip(2);

  let blockLength = reader.readUint32();
  ensure(blockLength > 0, "Broken NCM key block.");
  const keyData = reader.read(blockLength);
  for (let index = 0; index < keyData.length; index += 1) {
    keyData[index] ^= 0x64;
  }

  const decryptedKey = await aesEcbDecrypt(CORE_KEY, keyData);
  ensure(decryptedKey.length > 17, "Broken NCM decryption key.");
  const keyBox = buildKeyBox(decryptedKey.slice(17));

  blockLength = reader.readUint32();
  let metadata = null;
  if (blockLength > 0) {
    const modifyData = reader.read(blockLength);
    for (let index = 0; index < modifyData.length; index += 1) {
      modifyData[index] ^= 0x63;
    }

    const base64Payload = decodeAscii(modifyData.slice(22));
    const encryptedMeta = decodeBase64ToBytes(base64Payload);
    const decryptedMeta = await aesEcbDecrypt(MODIFY_KEY, encryptedMeta);
    const metaText = stripTrailingNulls(utf8Decoder.decode(decryptedMeta.slice(6)));
    metadata = JSON.parse(metaText);
  }

  reader.skip(5);
  const coverFrameLength = reader.readUint32();
  const coverLength = reader.readUint32();
  let coverData = new Uint8Array(0);
  if (coverLength > 0) {
    coverData = reader.read(coverLength);
  }

  ensure(coverFrameLength >= coverLength, "Broken NCM cover block.");
  reader.skip(coverFrameLength - coverLength);

  const decryptedAudio = decryptAudio(reader.remaining(), keyBox);
  const audioFormat = detectAudioFormat(decryptedAudio);
  const trackName = pickTrackName(metadata, stemFromFilename(filename));
  const artistText = formatArtists(metadata?.artist);
  const coverMimeType = coverData.length > 0 ? detectCoverMimeType(coverData) : null;

  return {
    metadata,
    artistText,
    audioFormat,
    audioBytes: decryptedAudio,
    audioMimeType: audioFormat === "mp3" ? "audio/mpeg" : "audio/flac",
    outputName: `${trackName}.${audioFormat}`,
    sourceName: filename,
    coverBytes: coverData,
    coverMimeType,
    coverName: coverMimeType ? `${trackName}-cover.${coverExtensionFromMime(coverMimeType)}` : null,
    warnings: coverData.length === 0 ? ["No embedded cover art found in this file."] : [],
  };
}

export function describeTrack(result) {
  const title = result.metadata?.musicName || stemFromFilename(result.sourceName);
  const album = result.metadata?.album || "Unknown album";

  return {
    title,
    album,
    artist: result.artistText,
    bitrate: result.metadata?.bitrate || null,
    duration: result.metadata?.duration || null,
    format: result.audioFormat.toUpperCase(),
  };
}
