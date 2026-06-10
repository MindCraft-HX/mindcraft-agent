import { createApp } from 'vue'
import store from './store';
import router from './router';
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import axios from 'axios';
import pinia from "./stores";

import 'highlight.js/styles/androidstudio.css';
import './styles/codeBlockStyles.scss';
import 'highlight.js/styles/default.css';
import './styles/claudeThemes.css';
import './assets/iconfont/iconfont.css';
import './assets/iconfont/iconfont.js';
// 原先的图库没有权限，新生成一份不含原图库的，不替换原本的避免顺序出问题
import './assets/iconfont_floatwin/iconfont.css';
import './assets/iconfont_floatwin/iconfont.js';


//BUG:这个会影响到自动编译库功能的生成，先停闭掉了
// import './mock/index'
import Katex from 'vue-katex-auto-render';

const app = createApp(App);

app.directive("katex", Katex);

// 监听复制按钮的点击事件
document.addEventListener('click', async (event) => {
  if (event.target.matches('.copy-btn')) {
    const text = event.target.getAttribute('data-clipboard-text')
    try {
      await navigator.clipboard.writeText(text)
      // 显示复制成功的消息
      event.target.innerText = 'Copied!'; // 添加这一行
      setTimeout(() => { event.target.innerText = 'Copy'; }, 3000); // 添加这一行
    } catch (err) {
      // 显示复制失败的消息
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
app.use(store);
app.mount('#app')
