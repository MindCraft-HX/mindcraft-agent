<template>
    <div>
      <!-- 抽屉 -->
      <el-drawer v-model="isDocxDrawerVisible" title="Docx" :with-header="false" size="80%" @open="initializeDocx"
        @close="destroyDocx">
        <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 5px;
          ">
          <div style="color: #a5aeae">Docx：</div>
          <div>
            <!-- 下载 -->
            <el-button type="primary">优化格式</el-button>
            <!-- <el-button type="primary" :icon="FolderOpened">打开文件夹</el-button> -->
            <el-button type="primary" :icon="Download" @click="DownloadDocx">另存为</el-button>
          </div>
        </div>
        <!-- 渲染流程图  -->
        <div class="Docx-container">
          <!-- <vue-office-docx :src="docx" @rendered="rendered" style="width: 100%; height: 100%" /> -->
          <div class="iframe-wrapper">
            <iframe ref="iframe" width="100%" style="border: none;"></iframe>
          </div>
        </div>
      </el-drawer>
    </div>
  </template>
  
  <script setup>
  import { ref, nextTick, watch, onMounted, watchEffect } from "vue";
  import {
    Plus,
    Minus,
    Download,
    Hide,
    FolderOpened,
  } from "@element-plus/icons-vue";
  //引入VueOfficeDocx组件
  import VueOfficeDocx from "@vue-office/docx";
  //引入相关样式
  import "@vue-office/docx/lib/index.css";
  import { Document, Packer, Paragraph, TextRun } from "docx";
  import { saveAs } from "file-saver";
  import markdownIt from "markdown-it";
  
  const md = new markdownIt();
  const iframe = ref(null);
  
  const isDocxDrawerVisible = ref(false);
  const docx = ref(null);
  
  const props = defineProps({
    DocxObj: {
      type: String,
    },
  });
  
  const Test = (html) => {
    return `
    <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <style>
          body {
            padding: 36px 76px;
            overflow-y: hidden;
          }
      </style>
  </head>
  <body>
    ${html}
  </body>
  </html>
    `
  }
  
  const initializeDocx = async () => {
    // 原来模样下载 预览
    // const htmlContent = md.render(props.DocxObj);
    // const doc = new Document({
    //   sections: [
    //     {
    //       properties: {},
    //       children: props.DocxObj.split("\n").map((line) => new Paragraph(line)),
    //     },
    //   ],
    // });
    // Packer.toBlob(doc).then((blob) => {
    //   //   saveAs(blob, 'output.docx');
    //   docx.value = URL.createObjectURL(blob);
    // });
  
    try {
      const html = md.render(props.DocxObj);
      const res = Test(html)
      insertHtmlToIframe(res);
    } catch (error) {
      console.error("转换失败:", error);
    }
  };
  
  function insertHtmlToIframe(html) {
    const doc =
      iframe.value.contentDocument || iframe.value.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    adjustIframeHeight();
  };
  
  function adjustIframeHeight() {
    const iframeDoc = iframe.value.contentDocument || iframe.value.contentWindow.document;
    iframe.value.style.height = iframeDoc.body.scrollHeight + 'px';
  }
  
  const rendered = () => { };
  const destroyDocx = () => { };
  
  // 下载
  const DownloadDocx = () => {
    const html = md.render(props.DocxObj);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  defineExpose({
    isDocxDrawerVisible,
  });
  </script>
  
  <style scoped>
  .Docx-container {
    height: 95%;
    border: 1px solid #a5aeae;
    border-radius: 10px 10px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    overflow: hidden;
    background-color: gray;
    padding: 18px 60px;
    overflow-y: visible;
  }
  
  .dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
  }
  
  :deep(.el-dialog__footer) {
    text-align: left;
  }
  
  .dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
  }
  
  /* .el-dialog__header{
    margin: 16px;
    border-bottom: 1px solid #000;
  } */
  :deep(.el-dialog__header) {
    margin: 16px;
    border-bottom: 1px solid #c7c7c9;
  }
  
  :deep(.el-dialog__title) {
    margin-left: -20px;
  }
  
  .iframe-wrapper {
    width: 595.3pt;
    background: #FFFFFF;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    min-height: 841.9pt;
    margin-top: 20px;
    /* 可以设置一个较小的初始值 */
    overflow: hidden;
  }
  </style>
  