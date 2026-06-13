<template>
  <div class="float-win" :class="{ 'float-win-in': userSeeWin, 'float-win-open': pageType > 0 }" @mouseover="moveInWin"
    @mousedown="moveWindow($event)" @mouseup="stopMove($event)" @click="clickWin">
    <div class="title-tab" v-if="[0, 2].includes(pageType) && (typeof replyInfo?.is_stop === 'undefined' || (typeof replyInfo?.is_stop !== 'undefined' && replyInfo?.is_stop))">
      <div class="mindcraft-flow-win-logo-icon"></div>
      <template v-if="pageType == 0">
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-jieshi" @mousedown.stop
          @click="explainMessage"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-fanyi" @mousedown.stop
          @click="translateMessage"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-yinyong" @mousedown.stop
          @click="quoteMessage"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-fuzhi"
          :class="copyMessageSuc ? 'icon-mindcraft-fuzhi-suc' : ''" @mousedown.stop @click="copyMessage"></div>
      </template>
      <template v-else-if="pageType == 2">
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-jieshi" @mousedown.stop
          @click="explainMessage"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-tupianzhuanwenzi" @mousedown.stop
          @click="screenshotMessage('image_to_text')"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-yutupianduihua" @mousedown.stop
          @click="screenshotMessage('chat_with_image')"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-tupianzhuanbiaoge" @mousedown.stop
          @click="screenshotMessage('image_to_table')"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-tupianzhuanJSON" @mousedown.stop
          @click="screenshotMessage('image_to_json')"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-a-HTMLdaimafuxiantupian" @mousedown.stop
          @click="screenshotMessage('image_to_html')"></div>
        <div class="title-btn-item mindcraft-flow-win-iconfont icon-mindcraft-fanyi" @mousedown.stop
          @click="translateMessage"></div>
      </template>
      <div style="flex: 1;"></div>
      <el-button style="margin-left: 6px;width: 22px; height: 22px;" circle type="danger" size="small" icon="CloseBold" @click="closeFloat()"></el-button>
      <setting ref="settingCom" :fromClient="fromClient" :pageType="pageType" v-model:llmModel="llmModel" v-model:picLlmModel="picLlmModel" v-model:modelInfo="modelInfo" @refreshWinSize="refreshWinSize" />
    </div>
    <div class="operation-popup" v-if="functionType != ''">
      <div class="message-title">
        <!-- <div style="font-size: 22px;" class="mindcraft-flow-win-logo-icon" v-if="!replyInfo?.is_stop"></div> -->
        <el-image style="width: 31px;height: 31px;border: 1px solid #636161;padding: 5px;border-radius: 50%;margin-right: 12px;" :src="modelInfo.image_url" />
        <div class="title-text">{{ realModel || $t('float.selectModel') }}</div>
        <div class="title-text" v-if="pageType == 0">{{ $t('float.here') }}{{ typeLabels[functionType] }}</div>
        <div style="flex: 1;"></div>
        <el-button style="margin-left: 18px;" circle type="danger" size="small" icon="CloseBold" @click="closeFloat()" v-if="pageType == 1"></el-button>
        <div style="color: #409EFF;font-size: 22px;" class="title-btn-item mindcraft-flow-win-iconfont"
          :class="winStatus.fixed ? 'icon-mindcraft-dingxuanzhong' : 'icon-mindcraft-ding'" @mousedown.stop
          @click="fixedWin"></div>
        <setting ref="settingCom" :fromClient="fromClient" :pageType="pageType" v-model:llmModel="llmModel" v-model:picLlmModel="picLlmModel" v-model:modelInfo="modelInfo" @refreshWinSize="refreshWinSize" v-if="pageType == 1" />
      </div>
      <div class="message-content" v-if="message">
        {{ message }}
      </div>
      <div class="operation-content">
        <div class="translate-content" v-if="functionType === 'translate'">
          <div class="auto-content">{{ $t('float.autoDetect') }}</div>
          <el-icon style="font-size: 19px;color: #000;"><Right /></el-icon>
          <el-select class="lang-select" popper-class="lang-select-options" v-model="chooseLang" :placeholder="$t('float.selectLang')" size="small">
            <el-option v-for="item in langList" :key="item.value" :label="item.name" :value="item.value" />
          </el-select>
        </div>
        <el-input class="user-input" clearable v-model="userMessage" :placeholder="$t('float.inputQuestion')"
          @keyup.enter="quoteMessageSure" @mousedown.stop
          v-if="['quote_ask', 'simple_answer', 'chat_with_image'].includes(functionType)">
          <template #append>
            <el-button style="padding-top: 0;padding-bottom: 0;" @click="quoteMessageSure"><div style="color: #409EFF;font-size: 22px;height: 100%;line-height: 100%;" class="mindcraft-flow-win-iconfont icon-mindcraft-huiche"></div></el-button>
          </template>
        </el-input>
        <template v-if="replyMessage">
          <el-scrollbar ref="replyScrollbar" class="reply-content" max-height="204px" max-width="100%" @scroll="replyScroll" @mousedown.stop>
            <div v-katex="optionsKatex" @click="refreshWinSize(565)" v-html="renderHtml(getPlainContent(replyMessage))"></div>
          </el-scrollbar>
          <div class="btn-list" v-if="replyInfo.is_stop">
            <div class="btn-list-item mindcraft-flow-win-iconfont icon-mindcraft-langdu"
            :class="{'icon-mindcraft-langduzhong':isSpeaking}" :style="{'color': isSpeaking ? '#409EFF' : '#707070'}" @mousedown.stop
              @click="readIterations"></div>
            <div class="btn-list-item mindcraft-flow-win-iconfont icon-mindcraft-fuzhi"
              :class="copyReplyMessageSuc ? 'icon-mindcraft-fuzhi-reply-suc' : 'icon-mindcraft-fuzhi-reply'" @mousedown.stop
              @click="copyReplyMessage"></div>
            <div class="btn-list-item mindcraft-flow-win-iconfont icon-mindcraft-zhongxinshengcheng" @mousedown.stop
              @click="rebuildReply"></div>
          </div>
          <div class="continue-btn" @mousedown.stop @click="continueAsk" v-if="replyInfo.is_stop">
            {{ $t('float.continueAsk') }}
            <div style="color: #409EFF;font-size: 22px;" class="mindcraft-flow-win-iconfont icon-mindcraft-huiche"></div>
          </div>
        </template>
        <el-progress style="margin: 8px 0;" :percentage="100" :stroke-width="15" striped striped-flow :duration="20" :show-text="false" v-if="showProgress"/>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Close, Location, LocationFilled, Check, Setting, FullScreen } from '@element-plus/icons-vue'
import setting from "./components/setting.vue"
import { getPlainContent } from "@/utils/filterTool";
import { renderHtml } from "@/utils/MarkdownIt";

/********** 初始化浮窗数据 *********/
const message = ref("")
const fromClient = ref("")
window.electronAPI.clipboardData((progress) => {
  initPage(0)
  if (progress.type === "text") {
    message.value = progress.message
    fromClient.value = progress.from_client
    console.log("clipboardData", progress)
  } else if (progress.type === "image") {

  }
})
window.electronAPI.openQAModel((progress) => {
  initPage(1)
  refreshWinSize()
  nextTick(() => {
    window.electronAPI.floatOperation({
      type: "QAWinSite",
    })
  })
})
window.electronAPI.openScreenShotsModel((progress) => {
  initPage(2)
  screenshot.value = progress.base64
  refreshWinSize()
})
// todo 回答中的失焦处理
// import { ElMessageBox } from 'element-plus'
// window.electronAPI.beforeFloatWinClose(async () => {
//   console.log("typeof replyInfo.value?.is_stop", typeof replyInfo.value?.is_stop)
//   if(typeof replyInfo.value?.is_stop === 'undefined') {
//     return true
//   } else {
//     console.log("replyInfo.value.is_stop", replyInfo.value.is_stop)
//     if(replyInfo.value.is_stop) {
//       return true
//     } else {
//       await ElMessageBox.confirm("AI正在输出回复，确定停止吗？", "提示", {
//         confirmButtonText: "确定",
//         callback: (action) => {
//           // enterpriseSetting.value = "add_enterprise";
//           if(action === "confirm") {
//             return true
//           }
//           return false
//         },
//       });
//       console.log("res11111", res)
//       return false
//     }
//   }
// })
const settingCom = ref(null)
const initPage = (type) => {
  abortRequest()
  const token = localStorage.getItem("access_token")
  if(!token) {
    closeFloat()
    return
  }
  pageType.value = type
  if(pageType.value === 1) {
    functionType.value = "simple_answer"
  } else {
    functionType.value = ""
  }
  stopSpeak()
  message.value = ""
  fromClient.value = ""
  userSeeWin.value = false
  userMessage.value = ""
  screenshot.value = null
  resetReply()
  refreshWinSize()
  nextTick(() => {
    settingCom.value?.getModelList()
  })
}
// 自适应窗口大小，慎用force
const refreshWinSize = (w, h, force = 0) => {
  nextTick(() => {
    const width = Math.max(w || 0, document.getElementsByClassName("float-win")[0].scrollWidth - 1)
    const height = Math.max(h || 0, document.getElementsByClassName("float-win")[0].scrollHeight)
    window.electronAPI.floatOperation({
      type: "changeSize",
      value: { width: force ? w : width, height: force ? h : height }
    })
  })
}
/********** 初始化浮窗数据 *********/


/********** 浮窗基本交互 *********/
const userSeeWin = ref(false)
const moveInWin = (e) => {
  userSeeWin.value = true
}
const moveWindow = (e) => {
  window.electronAPI.floatOperation({
    type: "move",
    value: "homeDragWindowStart"
  })
}
const stopMove = (e) => {
  window.electronAPI.floatOperation({
    type: "move",
    value: "homeDragWindowEnd"
  })
}
const clickWin = (e) => {
  window.electronAPI.floatOperation({
    type: "click"
  })
}
const closeFloat = () => {
  window.electronAPI.floatOperation({
    type: "close"
  })
}
const fixedWin = () => {
  window.electronAPI.floatOperation({
    type: "fixed",
    value: !winStatus.value.fixed
  })
  updateFloat()
}
/********** 浮窗基本交互 *********/

/********** 同步浮窗进程状态 *********/
const winStatus = ref({
  fixed: false
})
const updateFloat = () => {
  window.electronAPI.getFloatInfo()
    .then(res => {
      winStatus.value = res
    })
}
updateFloat()
window.electronAPI.refreshFloatInfo(updateFloat)
/********** 同步浮窗进程状态 *********/

/********** 浮窗功能 *********/
const pageType = ref(0) // 0:划词模式 1:qa模式 2:截图模式
// 切换功能
const changeType = (type) => {
  abortRequest()
  if(!message.value && pageType.value === 0) {
    console.log("请输入内容")
    closeFloat()
    return
  }
  functionType.value = type === functionType.value ? '' : type
  userMessage.value = ""
  resetReply()
  if(functionType.value) {
    refreshWinSize()
  } else {
    window.electronAPI.floatOperation({
      type: "changeSize",
      value: { width: 465, height: document.getElementsByClassName("float-win")[0].scrollHeight }
    })
  }
}
// 解释
const explainMessage = async () => {
  changeType('explain')
  if(!functionType.value) {
    return
  }
  await sendMessage()
}
// 翻译
const translateMessage = async () => {
  changeType('translate')
  if(!functionType.value) {
    return
  } else {
    await getLangList()
  }
  await sendMessage()
}
// 获取语种列表
import { apiSpotupWindowLanguage } from "@/api/application/flowWin"
const langList = ref([])
const getLangList = async () => {
  try {
    const res = await apiSpotupWindowLanguage()
    console.log(res)
    langList.value = res?.data?.data || []
  } catch (error) {
    console.log(error)
  }
  // 如果有语言列表，且没有选择中英文以外的语种，则判断是否是全中文来选择默认语种
  if(langList.value.length && (["简体中文", "英文"].includes(chooseLang.value) || !chooseLang.value) && message.value) {
    chooseLang.value = /[^\u4e00-\u9fa5\s\p{P}]/u.test(message.value) ? "简体中文" : "英文"
  } else if(!chooseLang.value) {
    chooseLang.value = "简体中文"
  }
}
// 引用
const userMessage = ref("")
const quoteMessage = async () => {
  changeType('quote_ask')
  if(!functionType.value) {
    return
  }
}
// 发起引用
const quoteMessageSure = async () => {
  resetReply()
  await sendMessage()
}
// 复制
const copyMessageSuc = ref(false)
let copyMessageTimer = null
const copyMessage = () => {
  window.electronAPI.clipboard().writeText(message.value)
  copyMessageSuc.value = true
  clearTimeout(copyMessageTimer)
  copyMessageTimer = setTimeout(() => {
    copyMessageSuc.value = false
  }, 500)
}
// 截图
const screenshotMessage = async (type) => {
  changeType(type)
  if(!functionType.value) {
    return
  }
  if(type === "chat_with_image") {
    return
  }
  await sendMessage()  
}
// 发送
import { useSend } from "./hook/chat";
const { sendMessage: send, abortRequest } = useSend()
const llmModel = ref('')
const picLlmModel = ref('')
const realModel = computed(() => pageType.value == 2 ? picLlmModel.value : llmModel.value)
const functionType = ref('') // explain:解释模式 translate:翻译模式 quote_ask:追问模式 chat_with_image:图片聊天模式 image_to_text:图片转文案模式 image_to_table:图片转表格模式 image_to_json:图片转JSON模式 image_to_html:HTML代码复现图片 simple_answer:简单对话模式
const { t } = useI18n()
const typeLabels = computed(() => ({
  explain: t('float.myExplain'),
  translate: t('float.myTranslate'),
  quote_ask: t('float.quoteContent'),
}))

// CSS content v-bind 需要 computed 属性
const cssFloatExplain = computed(() => t('float.explain'))
const cssFloatTranslate = computed(() => t('float.translate'))
const cssFloatQuote = computed(() => t('float.quote'))
const cssFloatCopySelect = computed(() => t('float.copySelect'))
const cssFloatCopied = computed(() => t('float.copied'))
const cssFloatToText = computed(() => t('float.toText'))
const cssFloatImageChat = computed(() => t('float.imageChat'))
const cssFloatToTable = computed(() => t('float.toTable'))
const cssFloatToJson = computed(() => t('float.toJson'))
const cssFloatPageReproduce = computed(() => t('float.pageReproduce'))
const cssFloatReadAloud = computed(() => t('float.readAloud'))
const cssFloatReading = computed(() => t('float.reading'))
const cssFloatCopyAnswer = computed(() => t('float.copyAnswer'))
const cssFloatRegenerate = computed(() => t('float.regenerate'))
const modelInfo = ref({})
const replyMessage = ref('')
const replyInfo = ref({})
const chooseLang = ref('')
const screenshot = ref(null)
const showProgress = ref(false)
const sendMessage = async () => {
  showProgress.value = true
  refreshWinSize(565)
  abortRequest()
  needScrollBottom.value = true
  const res = await send({
    model: realModel.value,
    func_type: functionType.value,
    selected_text: message.value,
    user_query: userMessage.value,
    target_language: chooseLang.value,
    screenshot: screenshot.value,
  }, (data) => {
    replyMessage.value = data.reduce((p, c) => {
      let data = {}
      try {
        data = JSON.parse(c)
      } catch (error) {
        console.warn(error, c)
        replyInfo.value = {}
        return p
      }
      replyInfo.value = data
      if(!data.is_stop) {
        data.assistant = data.assistant.replace('<think>', '<div class="think-value">')
        data.assistant = data.assistant.replace('</think>', '</div>')
        return p += data.assistant
      } else {
        return !!data.assistant ? data.assistant : p
      }
    }, '')
    refreshWinSize(565)
    nextTick(() => {
      if(needScrollBottom.value) {
        replyScrollbar.value?.setScrollTop(replyScrollbar.value?.wrapRef?.scrollHeight || Infinity)
      }
    })
  })
  .catch(err => {
    if(err?.response?.data) {
      try {
        const data = JSON.parse(err?.response?.data)
        replyMessage.value = data?.message || t('error.requestFailed')
      } catch (error) {
        console.log(error)
      }
    } else {
      console.log("异常", err)
    }
  })
  .finally(() => {
    showProgress.value = false
  })
}

const replyScrollbar = ref(null)
const needScrollBottom = ref(true)
const replyScroll = (el) => {
  needScrollBottom.value = replyScrollbar.value?.wrapRef?.scrollTop + replyScrollbar.value?.wrapRef?.clientHeight >= replyScrollbar.value?.wrapRef?.scrollHeight;
}

const optionsKatex = ref({
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
    { left: "\(", right: "\)", display: false },
    { left: "\[", right: "\]", display: true }

  ]
});
/********** 浮窗功能 *********/

/********** 回答功能 *********/
// 朗读
let utterance = new SpeechSynthesisUtterance(null);
let isSpeaking = ref(false);
const readIterations = () => {
  //如果正在播放语音，则停止播放
  if(stopSpeak()) return
  utterance.text = replyMessage.value; // Update the text property of the utterance
  utterance.lang = "zh-CN";
  utterance.rate = 1.2;
  utterance.pitch = 1.2;
  utterance.volume = 1;
  utterance.onstart = () => {
    isSpeaking.value = true;
  };
  utterance.onend = () => {
    isSpeaking.value = false;
  };
  speechSynthesis.speak(utterance);
}
// 停止朗读
const stopSpeak = () => {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    if (utterance.text === replyMessage.value) {
      isSpeaking.value = false;
      return true
    }
  }
  return false
}
// 复制
const copyReplyMessageSuc = ref(false)
let copyReplyMessageTimer = null
const copyReplyMessage = () => {
  window.electronAPI.clipboard().writeText(replyMessage.value)
  copyReplyMessageSuc.value = true
  clearTimeout(copyReplyMessageTimer)
  copyReplyMessageTimer = setTimeout(() => {
    copyReplyMessageSuc.value = false
  }, 500)
}
// 重新生成
const rebuildReply = async () => {
  stopSpeak()
  resetReply()
  sendMessage()
}
// 重置回复
const resetReply = () => {
  replyMessage.value = ""
  replyInfo.value = {}
  showProgress.value = false
}
// 继续提问
import { useAddRoom } from "./hook/chat";
const { temporaryChatAddRoom } = useAddRoom()
const continueAsk = async () => {
  try {
    stopSpeak()
    const params = {
      room_name: t('common.newRoom'),
      llm_model: realModel.value,
      selected_text: message.value || userMessage.value,
      screenshot: screenshot.value,
      assistant: replyMessage.value,
    }
    const res = await temporaryChatAddRoom(params)
    window.electronAPI.openClient({id:res.data.id})
    closeFloat()
  } catch (error) {
    
  }
}
/********** 回答功能 *********/
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.float-win {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  opacity: 0.8;
  border-radius: 5px;
  transition: opacity .2s ease-in-out;
  box-sizing: border-box;
  padding: 6px;
  /* 这个是阴影的最大距离 */
}

.float-win-in {
  opacity: 1;
}

.float-win-open {}

.title-tab {
  /* width: 100%; */
  display: flex;
  padding: 10px;
  justify-content: flex-start;
  align-items: center;
  background: #409EFF;
  box-shadow: 0px 3px 6px 1px rgba(0, 0, 0, 0.16);
  border-radius: 9px 9px 9px 9px;
}

.mindcraft-flow-win-logo-icon {
  flex-shrink: 0;
}

.title-btn-item {
  height: 22px;
  color: #FFFFFF;
  padding: 0 13px;
  text-align: center;
  line-height: 22px;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.title-btn-item.icon-mindcraft-jieshi:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatExplain);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-fanyi:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatTranslate);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-yinyong:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatQuote);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-fuzhi:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatCopySelect);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-fuzhi-suc:hover:after {
  content: v-bind(cssFloatCopied);
}

.title-btn-item.icon-mindcraft-tupianzhuanwenzi:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatToText);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-yutupianduihua:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatImageChat);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-tupianzhuanbiaoge:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatToTable);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-tupianzhuanJSON:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatToJson);
  margin-left: 6px;
}

.title-btn-item.icon-mindcraft-a-HTMLdaimafuxiantupian:hover:after {
  white-space: nowrap;
  content: v-bind(cssFloatPageReproduce);
  margin-left: 6px;
}

.operation-popup {
  background: #F9F9F9;
  box-shadow: 0px 3px 6px 1px rgba(0, 0, 0, 0.16);
  border-radius: 9px 9px 9px 9px;
  padding: 10px;
}

.message-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #409EFF;
  border-bottom: 2px solid #409EFF;
  padding-bottom: 7px;
  margin-bottom: 4px;
}

.title-text {
  font-size: 16px;
  margin-right: 13px;
}

.message-content {
  flex-shrink: 0;
  color: #409EFF;
  font-size: 12px;
  display: -webkit-inline-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  padding-left: 5px;
  border-left: 4px solid #409EFF;
  margin: 8px 0;
  user-select: none;
}

.operation-content {
  width: 100%;
  /* padding: 5px; */
  display: flex;
  flex-direction: column;
  user-select: none;
  font-size: 14px;
}

.translate-content {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin-bottom: 12px;
}
.auto-content{
  width: 181px;
  background: #FFFFFF;
  border-radius: 10px 10px 10px 10px;
  border: 1px solid #409EFF;
  padding: 8px 10px;
  color: #409EFF;
  font-size: 14px;
}
.lang-select {
  width: fit-content;
}
:deep(.lang-select .el-select__wrapper){
  width: 181px;
  background: #FFFFFF;
  border-radius: 10px 10px 10px 10px;
  border: 1px solid #409EFF;
  padding: 8px 10px;
  color: #000000;
  font-size: 14px;
  flex-shrink: 0;
}
.user-input input::placeholder {
  font-size: 14px;
}

.user-input {
  margin-top: 8px;
  margin-bottom: 10px;
  border-radius: 10px 10px 10px 10px;
  /* border: 1px solid #409EFF; */
}

.user-input .el-input__wrapper {
  padding: 6px 14px;
  background: #FFFFFF;
  font-size: 14px;
}

.user-input input::placeholder {
  color: #409EFF;
}

.reply-content {
  flex-shrink: 0;
  font-size: 14px;
  color: #000000;
}

.btn-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 7px;
  margin-bottom: 4px;
}

.btn-list-item {
  font-size: 14px;
  color: #707070;
  margin-right: 15px;
  cursor: pointer;
}

.btn-list-item.icon-mindcraft-langdu:after {
  content: v-bind(cssFloatReadAloud);
  margin-left: 12px;
}
.btn-list-item.icon-mindcraft-langduzhong:after {
  content: v-bind(cssFloatReading);
  margin-left: 12px;
  color: #409EFF;
}

.btn-list-item.icon-mindcraft-fuzhi-reply-suc:after {
  content: v-bind(cssFloatCopied);
  margin-left: 12px;
}

.btn-list-item.icon-mindcraft-fuzhi-reply:after {
  content: v-bind(cssFloatCopyAnswer);
  margin-left: 12px;
}

.btn-list-item.icon-mindcraft-zhongxinshengcheng:after {
  content: v-bind(cssFloatRegenerate);
  margin-left: 12px;
}

.num-input {
  width: 100px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  font-size: 10px;
}

.continue-btn {
  padding: 6px 10px;
  background: #FFFFFF;
  border-radius: 10px 10px 10px 10px;
  border: 1px solid #409EFF;
  font-size: 14px;
  color: #409EFF;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.hljs{
  overflow: auto;
}
.hljs::-webkit-scrollbar-track {
  display: none;
}
.hljs::-webkit-scrollbar {
  display: none;
}
.hljs::-webkit-scrollbar-thumb {
  display: none;
}
.hljs::-webkit-scrollbar-corner{
  display: none;
}


:deep(.code-block .header .button-group .run-btn) {
  background-color: #696969;
  font-family: "Consolas", "Courier New", monospace;
  margin-right: 5px;
  border-radius: 5px;
  color: #d2e7ff;
  height: 22px;
  transition: color 0.3s ease;
  cursor: pointer;
}

:deep(.think-value) {
  font-size: 13px;
  color: #636363;
  background: #fff;
  border-radius: 5px;
  padding: 3px;
  display: inline-block;
  margin-top: 10px;
  border: 1px solid #409eff;
  box-shadow: 0 0 0 1px var(--el-input-border-color,var(--el-border-color)) inset;
}
:deep(.open-think) {
  cursor: pointer;
  font-weight: 600;
  color: #409eff;
  margin-top: 15px;
}
</style>

<style>
.lang-select-options .el-select-dropdown__wrap {
  max-height: 80vh;
}
</style>