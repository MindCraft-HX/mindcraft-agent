'use strict';

/**
 * Image fetching utility — supports base64 data URLs, remote HTTP images,
 * and local file paths. Returns an Electron nativeImage or null on error.
 *
 * Extracted from electron/main.js (Phase 7 main.js split).
 */

const { nativeImage } = require('electron');
const axios = require('axios');

async function fetchImage(imageUrl) {
  try {
    if (imageUrl.startsWith('data:')) {
      // Pasted/dragged base64 data URL
      return nativeImage.createFromDataURL(imageUrl);
    }
    if (imageUrl.startsWith('http')) {
      // Remote image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });
      return nativeImage.createFromBuffer(Buffer.from(response.data));
    }
    // Local file path
    return nativeImage.createFromPath(imageUrl);
  } catch (error) {
    console.error('Failed to fetch image:', error);
    return null;
  }
}

module.exports = { fetchImage };
