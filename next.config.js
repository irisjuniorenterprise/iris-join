const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Épingle explicitement la racine du projet : évite que Turbopack
  // remonte vers un dossier parent (ex. Downloads/) contenant un autre
  // lockfile, et choisisse la mauvaise racine de workspace.
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
