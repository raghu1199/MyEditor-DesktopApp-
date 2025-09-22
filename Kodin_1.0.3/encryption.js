// encryption.js
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const ALGO = "aes-256-gcm";
const KEY = crypto.createHash("sha256").update("super-secret-key").digest(); // ⚠️ replace with secure key mgmt
const IVLEN = 16;

// 🔒 Encrypt buffer (always UTF-8 string → Buffer)
function encryptBuffer(str) {
  const buf = Buffer.from(str, "utf8");
  const iv = crypto.randomBytes(IVLEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]); // raw encrypted buffer
}

// 🔓 Decrypt buffer → UTF-8 string
function decryptBuffer(buf) {
  const iv = buf.slice(0, IVLEN);
  const tag = buf.slice(IVLEN, IVLEN + 16);
  const enc = buf.slice(IVLEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8"); // always UTF-8 string
}

// 🔒 Write encrypted shadow file
async function writeShadow(originalPath, content) {
  const folder = path.dirname(originalPath);
  const base = path.basename(originalPath);
  const shadowDir = path.join(folder, ".kodin");
  await fsp.mkdir(shadowDir, { recursive: true });

  const shadowPath = path.join(shadowDir, `${base}.kodin`);
  const encBuf = encryptBuffer(content); // content is string
  await fsp.writeFile(shadowPath, encBuf);

  return shadowPath;
}

// 🔓 Read shadow (if exists + valid)
async function readShadow(originalPath) {
  try {
    const folder = path.dirname(originalPath);
    const base = path.basename(originalPath);
    const shadowPath = path.join(folder, ".kodin", `${base}.kodin`);
    const buf = await fsp.readFile(shadowPath);
    return decryptBuffer(buf); // always UTF-8 string
  } catch {
    return null; // missing or corrupted
  }
}

// 🛡️ Scan a folder for source files without valid shadows → quarantine
async function scanAndQuarantine(folderPath, opts = {}) {
  const exts = opts.exts || [".c", ".cpp", ".py", ".java", ".js", ".ts"];
  const quarantineDir = path.join(folderPath, ".kodin_quarantine");
  await fsp.mkdir(quarantineDir, { recursive: true });

  const list = await fsp.readdir(folderPath, { withFileTypes: true });
  for (const d of list) {
    if (!d.isFile()) continue;
    const ext = path.extname(d.name).toLowerCase();
    if (!exts.includes(ext)) continue;

    const abs = path.join(folderPath, d.name);
    const content = await readShadow(abs);
    if (content === null) {
      // 🚨 Shadow missing/corrupt → quarantine
      const dest = path.join(quarantineDir, `${d.name}.${Date.now()}`);
      await fsp.rename(abs, dest);
      await fsp.writeFile(
        abs,
        `// ⚠️ Quarantined by Kodin\n// Shadow missing for ${d.name}\n// Original moved to ${dest}\n`,
        "utf8"
      );
    }
  }
  return { success: true, quarantineDir };
}

module.exports = {
  writeShadow,
  readShadow,
  scanAndQuarantine,
};
