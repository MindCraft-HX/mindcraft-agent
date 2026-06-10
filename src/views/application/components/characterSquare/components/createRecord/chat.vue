<template>
  <div class="chat-popup" :class="{'show-popup': showChat}">
    <div class="chat" v-show="showChat">
      <div class="chat-tips">请用文字或者语音输入您想要创建的角色，并与AI交流确认角色信息。请手动选择并确认角色信息。</div>
      <div class="chat-content">
        <el-scrollbar ref="scrollbar" width="100%" height="100%">
          <template v-for="item, index in messageList" :key="index">
            <div class="chat-message is-profile" v-if="item.profile">
              <div class="profile-title">
                <el-icon v-for="num in 3" :key="num"><CaretLeft /></el-icon>
                <template v-if="!item.showMore">
                  <span v-if="chooseId == item.id">角色信息已在左侧显示</span>
                  <span v-else>点击展开查看角色【{{ item.profile.user_name || "无" }}】的信息</span>
                </template>
              </div>
              <template v-if="item.showMore">
                <div class="profile-content">昵称: {{ item.profile.user_name || "无" }}</div>
                <div class="profile-content">角色介绍： {{ item.profile.description || "无" }}</div>
                <div class="profile-content">性格: {{ item.profile?.personality?.join("；") || "无" }}</div>
              </template>
              <div class="btn-content">
                <el-button size="small" color="#4272BE" round class="btn" type="primary" @click="chooseCharacter(item)">{{ !item.showMore ? "查看" : "收起"}}</el-button>
                <el-button size="small" round class="btn" :type="item.id != chooseId ?'default' : 'success'" @click="useCharacter(item)">{{ item.id == chooseId ? "已" : "" }}应用</el-button>
              </div>
            </div>
            <div :class="{'is-user': item.type == 'user'}" class="chat-message" v-html="renderHtml(getPlainContent(item.message))" v-else></div>
          </template>
          <div class="chat-message" v-html="renderHtml(getPlainContent(message))" v-if="message"></div>
        </el-scrollbar>
      </div>
      <div class="chat-input">
        <el-input class="item-input" :rows="3" type="textarea" v-model="inputMessage" placeholder="请输入内容" />
        <div class="btn-content" v-if="!awaitReply">
          <el-button class="microphone" color="#fff" link icon="Microphone" @click="microphone" v-if="!microphoneIng"></el-button>
          <el-button class="microphone" color="#fff" link @click="stopMicrophone" v-else><el-icon class="is-loading"><Loading /></el-icon>{{ microphoneText  }}</el-button>
          <el-button class="send" type="primary" icon="Promotion" @click="sendMessage">发送</el-button>
        </div>
        <div class="btn-content" v-else>
          <el-progress style="margin: 8px;flex: 1;" :percentage="100" :stroke-width="15" striped striped-flow :duration="20" :show-text="false"/>
          <el-button class="send" type="danger" icon="Promotion" @click="awaitReply = !awaitReply">停止</el-button>
        </div>
      </div>
    </div> 
    <el-button class="ai-btn" :color="showChat ? '#7898F8' : '#525252'" @click="showChat = !showChat">AI生成</el-button>
  </div>
</template>

<script setup>
import { inject, nextTick, onMounted, ref } from "vue";
import { character_ws } from "@/socket"
import { renderHtml } from "@/utils/MarkdownIt";
import { getPlainContent } from "@/utils/filterTool";
import { ElMessage } from "element-plus";

import { useMitt } from "@/utils/mitt";
const mitt = useMitt();

const showChat = ref(false)
const character = inject("character")

const inputMessage = ref('帮我创建一个角色')
const inputMessageAppend = () => {
  if(inputMessage.value) {
    messageList.value.push({ message: inputMessage.value, type: "user" })
    inputMessage.value = ""
  }
}
mitt.off("createUserCharacterInput")
mitt.on("createUserCharacterInput", (data) => {
  inputMessage.value = data?.text || ""
  if(data.end) {
    inputMessageAppend()
    scrollBottom()
  }
})

const messageList = ref([])
const message = ref("")
const messageAppend = (data = null) => {
  if(message.value) {
    messageList.value.push({ message: message.value, type: "ai", ...data })
    message.value = ""
  } else if (!!data) {
    messageList.value.push({ message: message.value, type: "ai", ...data })
  }
}

mitt.off("finishReplyCharacter")
mitt.on("finishReplyCharacter", () => {
  awaitReply.value = false
})
mitt.off("createUserCharacter")
mitt.on("createUserCharacter", (data) => {
  if(data?.llm_response) {
    message.value += data?.llm_response || ""
  }
  if(data?.character_profile) {
    if(data?.character_profile?.message == "exit") {
      ElMessage({
        message: '退出角色创建',
        type: 'success',
      })
      awaitReply.value = false
    } else {
      if(data?.character_profile?.length) {
        data?.character_profile?.forEach((item, index) => {
          console.log("item", item, index, index == 0)
          appendCharacterInfo(item, false)
        })
      } else {
        appendCharacterInfo(data?.character_profile, false)
      }
    }
  }
  scrollBottom()
})
import { uuid32 } from "@/utils/common";
const appendCharacterInfo = (data, use) => {
  const profile = {
    user_name: data?.name || "",
    description: data?.character_description || "",
    personality: data?.personality || [],
  }
  const id = uuid32()
  messageAppend({profile, id, showMore: true})
  if(use) {
    character.value = {
      ...character.value,
      ...profile
    }
    chooseId.value = id
  }
}

const chooseId = ref("")
const chooseCharacter = (item) => {
  item.showMore = !item.showMore
}
const useCharacter = (item) => {
  chooseId.value = item.id
  character.value = {
    ...character.value,
    ...item.profile
  }
}

/*********** 语音 ************/
import Recorder from 'js-audio-recorder';
let recorder = new Recorder({
    sampleBits: 16,                 // 采样位数，支持 8 或 16，默认是16
    sampleRate: 16000,              // 采样率，支持 11025、16000、22050、24000、44100、48000，根据浏览器默认值，我的chrome是48000
    numChannels: 1,                 // 声道，支持 1 或 2， 默认是1
    // compiling: false,(0.x版本中生效,1.x增加中)  // 是否边录边转换，默认是false
});
const microphoneIng = ref(false)
const microphoneText = ref("录音中")
const microphone = () => {
  console.log("microphone")
  inputMessage.value = ""
  microphoneIng.value = true
  microphoneText.value = "录音中"
  recorder.start().then(() => {
    // 开始录音
    console.log('开始录音了=========')
  }, (error) => {
      // 出错了
      console.log(error)
      ElMessage({
        message: error,
        type: 'error',
      })
      recorder.stop()
      microphoneIng.value = false
  })
}
const stopMicrophone = async () => { 
  microphoneText.value = "识别中"
  const data = recorder.getPCMBlob();
  // recorder.downloadPCM('test');
  const buffer = await data.arrayBuffer();
  messageAppend()
  character_ws.sendMessage('createUserCharacter', { asr_text: '', character_profile: character.value })
  sendVoice(buffer)
  // character_ws.sendMessage('createCharacterByVoice', {file: buffer})
  // setTimeout(() => {
  //   character_ws.sendMessage('createCharacterByVoiceStop')
  //   microphoneIng.value = false
  // }, 1000);
}
const sendVoice = (file, offset = 0) => {
  const chunkSize = 1024 * 8
  const offsetNext = offset + chunkSize
  const buffer = file.slice(offset, offsetNext)
  character_ws.sendMessage('createCharacterByVoice', {file: buffer})
  if( offsetNext < file.byteLength ) {
    setTimeout(() => {
      sendVoice(file, offsetNext)
    }, 100)
  } else {
    setTimeout(() => {
      character_ws.sendMessage('createCharacterByVoiceStop')
      microphoneText.value = "识别完成"
      microphoneIng.value = false
    }, 100)
  }
  awaitReply.value = true
}
/*********** 语音 ************/

/*********** 按钮 ************/
const awaitReply = ref(false)
const sendMessage = () => {
  if(!inputMessage.value) {
    return
  }
  messageAppend()
  messageList.value.push({ message: inputMessage.value, type: "user" })
  character_ws.sendMessage(
    'createUserCharacter',
    { asr_text: inputMessage.value, character_profile: character.value }
  )
  inputMessage.value = ""
  scrollBottom()
  ElMessage({
    message: '发送成功，请稍后',
    type: 'success',
  })
  awaitReply.value = true
}
/*********** 按钮 ************/

/*********** 滚动到底部 ************/
const scrollbar = ref(null)
const scrollBottom = async () => {
  await nextTick()
  if (scrollbar.value) {
      const container = scrollbar.value.$el.querySelector('.el-scrollbar__wrap');
      container.style.scrollBehavior = 'smooth'; // 添加平滑滚动效果
      container.scrollTop = container.scrollHeight;
  }
}
/*********** 滚动到底部 ************/
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.chat-popup{
  box-sizing: border-box;
  &.show-popup{
    flex: 1;
  }
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-end;
  // margin-left: 30px;
  min-width: 0;
}
.chat {
  width: 100%;
  min-width: 0;
  min-height: 0;
  background: #F8F8F8;
  border-radius: 29px 29px 29px 29px;
  display: flex;
  flex-direction: column;
  align-items: center;  
  padding: 19px 15px;
  .chat-tips{
    width: 100%;
    font-size: 16px;
    color: #707070;
    padding-bottom: 16px;
    border-bottom: 2px solid #61ACFA;
    margin-bottom: 16px;
  }
  .chat-content{
    width: 100%;
    font-size: 16px;
    color: #707070;
    padding-bottom: 16px;
    overflow: auto;
    display: flex;
    .chat-message{
      color: #707070;
      background: #fff;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
      width: fit-content;
      max-width: 100%;
      margin-left: 0;
      margin-right: auto;
      &.is-profile{
        background-image: url("@/assets/characterSquare/chat.png"), linear-gradient( 90deg, #2C68FF 0%, #4D82FF 100%);
        background-repeat: no-repeat;
        background-position: bottom right;
        color: #fff;
        width: 60%;
        .profile-title{
          display: flex;
          align-items: center;
          line-height: 1;
          margin-bottom: 12px;
        }
        .profile-content{
          margin-bottom: 26px;
        }
        .btn-content{
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          .el-button {
            margin: 0;
            margin-bottom: 6px;
          }
        }
      }
      &.is-user{
        background: #E6F7FF;
        margin-right: 0;
        margin-left: auto;
      }
    }
  }
  .chat-input{
    width: 100%;
    position: relative;
    .btn-content{
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
    }
    .microphone{
      // position: absolute;
      // left: 10px;
      // bottom: 10px;
      font-size: 22px;
    }
    .send{
      // position: absolute;
      // right: 16px;
      // bottom: 10px;
      font-size: 16px;
    }
    .item-input{
      --el-input-border-radius: 10px;
      font-size: 16px;
      color: #000000;
      :deep(.el-textarea__inner){
        // padding-bottom: 60px;
        resize:none;
        padding: 12px;
      }
    }
  }
}
.ai-btn{
  flex-shrink: 0;
  min-width: 0;
  width: fit-content;
  color: #fff;
  margin-top: 30px;
}
:deep(.code-block pre.hljs) {
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

:deep(.code-block pre.hljs::-webkit-scrollbar) {
  width: 6px;
  height: 8px;
}

:deep(.code-block pre.hljs::-webkit-scrollbar-thumb) {
  background-color: #dddee0;
  border-radius: 10px;
  transition: background-color 0.3s;
  cursor: pointer;
}

:deep(.code-block pre.hljs::-webkit-scrollbar-track) {
  background-color: #ffffff;
}

:deep(.code-block pre.hljs::-webkit-scrollbar-thumb:hover) {
  background-color: rgba(81, 82, 82, 0.3);
}
</style>