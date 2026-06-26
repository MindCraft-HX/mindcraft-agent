import MarkdownIt from "markdown-it";
import markdownItMermaid from "@DatatracCorporation/markdown-it-mermaid";
import hljs from "highlight.js";
import { useMitt } from "./mitt.js";
import { markdownItLocalPathPlugin } from "@mindcraft/agent/render";

const mitt = useMitt();

// 代码高亮
const md_ = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight: function (str, lang) {
    let html = "";
    if (lang && hljs.getLanguage(lang)) {
      try {
        const preCode = hljs.highlight(str, {
          language: lang,
          ignoreIllegals: true,
        }).value;
        const lines = preCode.split(/\n/).slice(0, -1);
        html = lines
          .map((item, index) => {
            return (
              '<li><span class="line-num" data-line="' +
              (index + 1) +
              '"></span>' +
              item +
              "</li>"
            );
          })
          .join("");
      } catch (__) {}
    }
    if (!html) {
      const preCode = md_.utils.escapeHtml(str);
      const lines = preCode.split(/\n/).slice(0, -1);
      html = lines
        .map((item, index) => {
          return (
            '<li><span class="line-num" data-line="' +
            (index + 1) +
            '"></span>' +
            item +
            "</li>"
          );
        })
        .join("");
    }
    html = "<ol>" + html + "</ol>";
    // 将代码块内的 $ 转为 HTML 实体，防止 KaTeX 误解析
    html = html.replace(/\$/g, '&#36;').replace(/\\/g, '&#92;');
    // 添加 "run" 按钮
    const runButton =
      lang.trim() === "html"
        ? `<button class="run-btn" data-code="${md_.utils.escapeHtml(
            str
          )}">Run</button>`
        : "";
    return (
      '<div class="code-block"><div class="header"><b class="name">' +
      lang.trim() +
      '</b><div class="button-group"><button class="copy-btn" data-clipboard-text="' +
      md_.utils.escapeHtml(str) +
      '">Copy</button>' +
      runButton +
      '</div></div><pre class="hljs"><code>' +
      html +
      "</code></pre></div>"
    );
  },
});
md_.use(markdownItMermaid);
md_.use(markdownItLocalPathPlugin);

const slugify = (text) =>
  String(text || "")
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const defaultHeadingOpen =
  md_.renderer.rules.heading_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md_.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
  const inlineToken = tokens[idx + 1];
  if (inlineToken?.type === "inline") {
    const slug = slugify(inlineToken.content);
    if (slug) tokens[idx].attrSet("id", slug);
  }
  return defaultHeadingOpen(tokens, idx, options, env, self);
};

md_.renderer.rules.bullet_list_open = function (tokens, idx, options, env, self) {
  const next = tokens[idx + 1];
  if (next?.type === "list_item_open" && /^\[[ xX]\]\s/.test(next.markup || "")) {
    tokens[idx].attrJoin("class", "md-task-list");
  }
  return self.renderToken(tokens, idx, options);
};

const defaultListItemOpen =
  md_.renderer.rules.list_item_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md_.core.ruler.after("inline", "mindcraft-task-list", (state) => {
  for (const token of state.tokens) {
    if (token.type !== "inline" || !Array.isArray(token.children) || !token.children.length) continue;
    const first = token.children[0];
    if (!first || first.type !== "text") continue;
    const match = first.content.match(/^\[([ xX])\]\s+/);
    if (!match) continue;
    first.content = first.content.slice(match[0].length);
    token.children.unshift(Object.assign(new state.Token("html_inline", "", 0), {
      content: `<input class="md-task-checkbox" type="checkbox" disabled${match[1].toLowerCase() === "x" ? " checked" : ""}>`
    }));
    token.meta = token.meta || {};
    token.meta.isTaskItem = true;
    token.meta.isTaskChecked = match[1].toLowerCase() === "x";
  }
});

md_.renderer.rules.list_item_open = function (tokens, idx, options, env, self) {
  const next = tokens[idx + 2];
  if (next?.type === "inline" && next.meta?.isTaskItem) {
    tokens[idx].attrJoin("class", next.meta.isTaskChecked ? "md-task-item is-checked" : "md-task-item");
  }
  return defaultListItemOpen(tokens, idx, options, env, self);
};

// run 事件监听器
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}
if (typeof document !== 'undefined') {
document.addEventListener("click", debounce(function (event) {
  // if (event.target && event.target.classList.contains("run-btn")) {
  //   const code = event.target.getAttribute("data-code");
  //   // // 触发事件并传递代码内容
  //   // mitt.emit('run-button-clicked', code);
  //   // // 打开
  //   // mitt.emit("OpenDrawer");
  //   mitt.emit("run-button-clicked", code);
  // }
  if (event.target && event.target.classList.contains("run-btn")) {
    const code = event.target.getAttribute("data-code");
    window.electronAPI.openCodeWin({
      type: 'html',
      title: 'HTML运行结果',
      codeData: code,
    })
  }
}, 300));
}

// 添加钩子处理 img 标签
md_.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  token.attrSet('style', 'max-width: 100%;');
  return self.renderToken(tokens, idx, options);
};


// 正则
export const renderHtml = (markdown) => {
  if (!markdown) return '';
  // 保护各种公式格式，防止 MarkdownIt 破坏内容
  const blocks = [];
  const protect = (match) => {
    blocks.push(match);
    return `@@BLOCK_${blocks.length - 1}@@`;
  };
  let protected_ = markdown
    .replace(/\$\$[\s\S]*?\$\$/g, protect)         // $$...$$  块级
    .replace(/\\\[[\s\S]*?\\\]/g, protect)          // \[...\]  块级
    .replace(/\\\([\s\S]*?\\\)/g, protect)          // \(...\)  行内
    .replace(/\$(?!\$)([^\n$]+?)\$/g, protect);     // $...$    行内（不跨行）
  let rendered = md_.render(protected_);
  // 还原公式占位符
  rendered = rendered.replace(/@@BLOCK_(\d+)@@/g, (_, i) => blocks[+i]);
  return rendered;
};

export const codeBlockRegex = (markdown) => {
  const codeBlockRegex = /```[\s\S]*?```/;
  const regex = /https?:\/\/[^\s]+/;
  return codeBlockRegex.test(markdown) || regex.test(markdown);
};

export const htmlTagRegex = (text) => {
  const regex = /<\/?[a-zA-Z][\w-]*(\s+[^>]*?)?>/;
  return regex.test(text);
};
