const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async function globalTeardown() {
  const marker = path.join(os.tmpdir(), 'sikunjung-jest-root.txt');
  if (!fs.existsSync(marker)) return;
  const root = fs.readFileSync(marker, 'utf8').trim();
  if (root && root.includes('sikunjung-jest-')) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fs.rmSync(marker, { force: true });
};
