<template>
    <div class="groupchat-layout">
      <Contacts ref="contacts" class="contacts" />
      <div class="groupchat-box">
        <el-affix class="groupchat-header" >
              <el-button text size="large">{{ selectedContactRoom }}</el-button>
              <el-tooltip content="清空信息" effect="light">
                <el-button class="chat-header-button" type="primary" plain  icon="Refresh" @click="deleteChatHistory"/>
              </el-tooltip>
        </el-affix>
        <div ref="chatContentRef" class="message-list">
          <div v-for="message in messages" :key="message.id" class="message" :class="message.sender === username ? 'my-message' : 'other-message'">
            <div class="message-content">
              <div class="message-username" v-if="message.sender !== username">{{ message.sender }}</div>
              <div v-if="editingMessageId !== message.id" v-html="$md.render(message.content)" />
              <div v-else>
              <el-input 
              v-model="message.content" 
              type="textarea"
              autosize
              @keyup.enter.exact="editMessage(message.id, message.content)"
              @keydown.shiftKey="changeLine"
              @keyup.esc="endEditing"
              style="margin-bottom: 5px;"
              ></el-input>
              <el-button @click="editMessage(message.id, message.content)" icon="Check" type="primary" size="small" />
              <el-button @click="endEditing(message.id)" icon="Close" type="danger" size="small" />
              </div>
            </div>
            <div class="message-info">
              <div class="message-model" v-if="message.sender !== username">模型: {{ message.llm_model }}</div>
              <div class="message-token-usage" v-if="message.sender !== username">Token使用:
                <span v-for="(value, key) in message.usage" :key="key">
                    {{ key }}: {{ value }},
                </span></div>
              <div class="message-stop-reason" v-if="message.sender !== username">停止原因: {{ message.stop_reason === 'stop' ? '回答完毕' : '字数上限' }}</div>
              <div class="message-actions">
                  <el-tooltip effect="light" content="重新发送">
                      <el-button icon="Refresh" @click="refreshMessage(message)" />
                  </el-tooltip>
                  <el-tooltip effect="light" content="编辑">
                      <el-button icon="Edit" @click="startEditing(message.id)" />
                  </el-tooltip>
                  <el-tooltip effect="light" content="复制文本">
                      <el-button icon="copyDocument" @click="copyMessage(message.content)" />
                  </el-tooltip>
                  <el-tooltip effect="light" content="复制文本+格式">
                      <el-button icon="documentCopy" @click="copyHtml(message.content)" />
                  </el-tooltip>
                  <el-tooltip effect="light" content="删除">
                      <el-button icon="Delete" @click="deleteMessage(message.id)" />
                  </el-tooltip>
              </div>
            <div class="message-time">{{ message.time }}</div>
          </div>
        </div>
        <div class="chat-affix">
        <el-affix 
        target=".message-list" 
        position="bottom"
        :offset="200">
            <el-button type="info" plain icon="CaretTop" size="small" circle @click="scrollToTop"></el-button>
            <el-button type="info" plain icon="CaretBottom" size="small" circle @click="scrollToBottom"></el-button>
        </el-affix>
        </div>
      </div>
      <div class="chat-toolbar">
        <div class="model-select">
          <label>模型选择：</label>
        <el-select v-model="llm_model"  placeholder="选择模型" style="width: 200px;">
          <el-option
            v-for="item in options"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        </div>
        <div class="buffer-select">
        <label>记忆缓存数：</label>
          <el-select v-model="buffer_size" placeholder="请选择" style="width: 60px;">
            <el-option
              v-for="i in 20"
              :key="i"
              :label="i.toString()"
              :value="i">
            </el-option>
          </el-select>
        </div>
        <div>
          <el-upload
            v-model:file-list="fileList"
            class="chat-toolbar-upload"
            action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
            multiple
            :on-preview="handlePreview"
            :on-remove="handleRemove"
            :before-remove="beforeRemove"
            :limit="5"
            :on-exceed="handleExceed"
          >
            <el-button type="primary" icon="Upload" disabled>导入文件</el-button>
          </el-upload>
        </div>
        <div class="add-library">
          <el-button-group>
          <el-button :type="libraryButtonType" icon="SwitchButton" @click="toggleLibrarySwitch"></el-button>
          <el-button type="primary" @click="openLibrary" icon="Collection">
            知识库</el-button>
          </el-button-group>
        </div>
        <div class="add-prompt">
          <el-button-group>
          <el-button :type="promptButtonType" icon="SwitchButton" @click="togglePromptSwitch"></el-button>
          <el-button type="primary" @click="openPrompt" icon="MessageBox">
            预设指令</el-button>
          </el-button-group>
        </div>
      </div>
        <div class="input-box">
          <el-progress
            v-if = "messageLoading"
            :percentage="100"
            :stroke-width="20"
            :show-text="false"
            :duration="20"
            striped
            striped-flow
          />
          <div class="input-box-header" v-if = "!messageLoading">
          <el-input
            v-model="inputMessage"
            :placeholder="inputPlaceholder"
            type="textarea"
            resize="none"
            :autosize="{ minRows: 2, maxRows: 6 }"
            clearable
            :disabled="messageLoading"
            @keyup.enter.exact="sendMessage"
            @keydown.shiftKey="changeLine"
          ></el-input>
          <el-button class="sendbtn" type="primary" @click="sendMessage">发送</el-button>
          </div>
          <div class="input-box-footer">
            <el-text size="small" type="info">[Shift+Enter] = 换行，[Enter] = 发送信息</el-text>
          </div>
        </div>
      </div>
      <el-dialog
        title="初始化设置提示(请确保以下设置已完成)"
        width="30%"
        v-model="initializedVisible"
        >
        <el-card>
          <el-text size="large" type="primary" class="initial-card">
            <el-icon size="large"><Position /></el-icon>
          请进入右上方设置，设置API相关信息！</el-text>
          <br><br>
          <el-text size="large" type="success" class="initial-card">
            <el-icon size="large"><ArrowLeftBold /></el-icon>
            然后点击左侧添加新的对话，开始对话吧！</el-text>
        </el-card>
      </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, computed, provide, watch, watchEffect } from 'vue';
import { ElButton, ElTooltip, ElMessage, ElMessageBox } from 'element-plus';
import {useStore} from 'vuex';
import Contacts from './Contacts.vue';

const store = useStore();
const username = localStorage.getItem('username');
const selectedContactRoom = ref('');

</script>

<style scoped>
.groupchat-layout{
  display: flex;
  height: 100%;
  width: 100%;
  min-height: 800px;
}
.contacts {
  margin-right: 5px;
}
.initial-card {
  margin-bottom: 18px;
}
.groupchat-box {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 400px;
  max-height: 800px;
  min-width: 900px;
  border: 1px solid #ccc;
  /* overflow-x: auto; */
}
.groupchat-header{
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(to top, rgba(0, 0, 0, 0), rgba(173, 222, 255, 0.5));
  height: 30px;
  padding: 10px;
}

.message-list {
  position: relative;
  flex: 1;
  padding: 10px;
  overflow-y: auto;
}
.disabled {
  pointer-events: none;
  opacity: 0.5; /* 可选，设置透明度以表示禁用状态 */
}

.message {
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 10px;
  display: block;
  max-width: 80%;

}

.my-message {
  background-color: #e6f7ff;
  /* text-align: right; */
  margin-left: auto;
  padding-left: 20px;
  width: fit-content;
  
}

.other-message {
background-color: #f0f0f0;
width: fit-content;
padding-left: 20px;
}

.message-content {
  font-size: 14px;
  /* display: inline-flex; */
  max-width: auto; 
  /* word-wrap: break-word; */
  /* word-break: break-all; */
  /* white-space: pre-wrap; */
}

.message-username {
  font-size: 12px;
  color: #999;
  margin-right: 5px;
  }

.message-info {
  /* display: flex; */
  align-items: center;
  margin-top: 5px;
  }

.message-time {
  font-size: 12px;
  color: #999;
}

.message-model {
  font-size: 10px;
  color: #999;
  margin-right: 5px;
  }
.message-token-usage {
  font-size: 10px;
  color: #999;
  margin-right: 5px;
}
.message-stop-reason {
  font-size: 10px;
  color: #999;
  margin-right: 5px;
}

.message-actions {
  align-items: center;
  margin-right: 5px;
}

.message-actions .el-button {
background-color: transparent;
border: transparent;
padding: 5px;
}

.message-actions .el-button:hover{
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  background-color: #f5f5f5;
}
.chat-affix{
  position: absolute;
  right: 20px;
}
.chat-toolbar {
  display: inline-flex;
  padding-left: 10px;
  height: 45px;
  /* min-width: 900px; */
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(173, 222, 255, 0.5));
  font-size: 14px;
  color: #999;
  overflow-x: auto;
}
.chat-toolbar > * {
  padding: 5px;
  height: fit-content;
}

.chat-toolbar-upload{
  display: flex;
}
.input-box {
  align-items: center;
  padding: 10px;
  background-color: #f5f5f5;
  border-top: 1px solid #ccc;
}
.input-box-header {
  display: flex;
  align-items: center;
  width: 100%;
}
.input-box-footer {
  display: flex;
  align-items: center;
  margin-top: 5px;
  margin-left: 5px;
  width: 100%;
}
.el-input {
  flex: 1;
  margin-right: 10px;
  resize: vertical;
  overflow: auto;
}

.sendbtn {
  width: 80px;
  margin-left: 10px;
}
</style>