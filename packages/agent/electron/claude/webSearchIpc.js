'use strict';

/**
 * Claude web search IPC handler — DuckDuckGo HTML search (no API key needed).
 *
 * Extracted from claudeAgent.js (R09 main handler setup split).
 */

function registerWebSearchIpc(ipcMain, { lt }) {
  ipcMain.handle('chat-web-search', async (_event, { query }) => {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return { results: [] };
    }
    try {
      const axios = require('axios');
      const q = encodeURIComponent(query.trim());
      // 使用 DuckDuckGo HTML 搜索（无需 API key）
      const resp = await axios.get(`https://html.duckduckgo.com/html/?q=${q}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000,
      });
      const html = typeof resp.data === 'string' ? resp.data : '';
      // 简易解析：提取 result__snippet 和 result__url
      const results = [];
      const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const urlRe = /class="result__url"[^>]*>([\s\S]*?)<\/a>/g;
      const titleRe = /class="result__a"[^>]*>([\s\S]*?)<\/a>/g;

      let m;
      const snippets = []; while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
      const urls = []; while ((m = urlRe.exec(html)) !== null) urls.push(m[1].replace(/<[^>]+>/g, '').trim());
      const titles = []; while ((m = titleRe.exec(html)) !== null) titles.push(m[1].replace(/<[^>]+>/g, '').trim());

      const max = Math.min(5, snippets.length, urls.length);
      for (let i = 0; i < max; i++) {
        results.push({ title: titles[i] || '', url: urls[i] || '', snippet: snippets[i] || '' });
      }

      return { results };
    } catch (e) {
      console.warn('[chat-web-search] failed:', e?.message || e);
      return { results: [], error: e?.message || lt('search.failed') };
    }
  });
}

module.exports = { registerWebSearchIpc };
