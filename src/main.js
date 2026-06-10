import { createApp } from 'vue'
import router from './router';
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import pinia from "./stores";

import 'highlight.js/styles/androidstudio.css';
import './styles/codeBlockStyles.scss';
import 'highlight.js/styles/default.css';
import './styles/claudeThemes.css';
import './assets/iconfont/iconfont.css';
import './assets/iconfont/iconfont.js';

import Katex from 'vue-katex-auto-render';

const app = createApp(App);

app.directive("katex", Katex);

// 监听复制按钮的点击事件
document.addEventListener('click', async (event) => {
  if (event.target.matches('.copy-btn')) {
    const text = event.target.getAttribute('data-clipboard-text')
    try {
      await navigator.clipboard.writeText(text)
      event.target.innerText = 'Copied!';
      setTimeout(() => { event.target.innerText = 'Copy'; }, 3000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }
})

window.addEventListener('mindcraft-toast', (event) => {
  const message = event?.detail?.message
  const type = event?.detail?.type || 'warning'
  if (!message) return
  ElMessage({
    type,
    message,
  })
})

app.use(ElementPlus)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}

window.VITE_NODE_ENV = import.meta.env.VITE_NODE_ENV
window.VITE_NODE_PLATFORM = import.meta.env.VITE_NODE_PLATFORM

app.use(pinia);
app.use(router);
app.mount('#app')
