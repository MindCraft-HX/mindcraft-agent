<!-- 语音模式 -->
<template>

  <div class="voice-content-box">
    <div class="voice-avater">
      <div class="avater machine-avater">
        <video v-if="getAvater.type == 'video'" :src="getAvater.url" autoplay :controls="false" loop
          :class="activeRoleAvater('machine')"></video>
        <img v-else :src="getAvater.url" :class="activeRoleAvater('machine')"
          :title="preference?.character?.character_name" />
      </div>
      <div class="voice-mode">
        <div ref="audioRef" class="voice-siri-wave"></div>
        <div v-if="autoInputVoice">
          <div v-if="!lineBusy" class="voice-hangUp" @click="handleCall"></div>
          <div v-else class="voice-talking" @click="handleHangUp"></div>
        </div>
        <div v-else>
          <div class="click-talk-btn">
            <div v-if="!isTalk" @click="handleStartTalk">点击开始说话</div>
            <div v-else @click="handleStopTalk">点击停止</div>
          </div>
          <div class="voice-mode-send">
            自动发送
            <el-switch v-model="autoSend" size="large"
              style="--el-switch-on-color: #45d430; --el-switch-off-color:  #7d7d7d"
              @change="handleChangeAutoSend"></el-switch>
          </div>
        </div>
      </div>
      <div class="avater user-avater">
        <video v-if="getUserAvater.type == 'video'" :src="getUserAvater.url" autoplay :controls="false" loop
          :class="activeRoleAvater('user')"></video>
        <img v-else :src="getUserAvater.url" :class="activeRoleAvater('user')"
          :title="preference?.userFile?.user_name" />
      </div>
    </div>
    <!-- 键盘输入按钮 -->
    <div style="margin:10px 50px ; ">
      <VoiceIcon tip="键盘输入" :active="curVoiceRole === 'user'" size="40px" name="keyboard" activeColor="#fff"
        inActiveColor="#4A4A5D" activeBgColor="#409EFF" @click="clickKeyBoard">
      </VoiceIcon>
    </div>
    <div class="text-content-box">
      <audio ref="audioPlayer"></audio>
      <!--  用户输入 -->
      <div class="text-card text-input-box" :class="activeRoleCard('user')">
        <el-input class="input" style="width: 100%" v-model="input" :rows="3" type="textarea" clearable
          @keyup.enter.exact="handleSendText" @keydown="messageKeydown" />
        <div class="send-btn" v-if="!autoInputVoice && curVoiceRole === 'user'">
          <el-text size="small" type="info">[Shift+Enter] = 换行，[Enter] = 发送信息</el-text>&nbsp;
          <el-button :loading="sendLoading" class=" mindcraft-flow-win-iconfont icon-mindcraft-send-message"
            type="primary" @click="handleSendText">&nbsp;发送</el-button>
        </div>
      </div>
      <!-- AI回答 -->
      <div class="text-card text-output-box" :class="activeRoleCard('machine')">
        <el-input class="input" style="width: 100%" v-model="output" :rows="3" type="textarea" readonly clearable />
        <div class="send-btn">

          <el-button v-show="AgentState === 'active' || isAudioPlaying" color="#ff4040" type="primary"
            @click="handleInterruption">
            <div style="background-color: #fff;width:10px;height: 10px;border-radius: 2px;"></div>&nbsp;打断
          </el-button>
        </div>
      </div>
    </div>
    <Toast ref="toastRef" />
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch, onUnmounted } from "vue"
import AudioVisual from '@/utils/audioVisual.js'
import Recorder from 'js-audio-recorder'
import { multi_model_ws } from '@/socket/index.js'
import { useMitt } from "@/utils/mitt";
import { useVoicePreferenceStore } from '@/stores/voicePreference.js'
import { MicVAD } from "@ricky0123/vad-web"
import Toast from '@/components/VoiceInteraction/components/toast.vue'
import VoiceIcon from '@/components/VoiceInteraction/components/Icon.vue'
const preference = useVoicePreferenceStore()
// import ManualVoice from '@/components/VoiceInteraction/components/manualVoice.vue'
const mitt = useMitt();
const input = ref("") // 用户输入
const output = ref('') // 机器人回复
const curVoiceRole = ref('user') //当前说话角色  user:用户  machine:机器
const autoSend = ref(true) // 是否自动发送
const toastRef = ref(null)
const receiveTextStream = ref([]) // 接收的文本流
const receiveAudioStream = ref([]) // 接收的音频流
const audioPlayer = ref(null) // 音频播放器
const isAudioPlaying = ref(false) // 是否正在播放音频
const AgentState = ref('')// // stop智能体已停止 |asr 智能体语音识别|invalid 智能体无识别|active智能体正在回答|error 智能体未初始化
const emotion = ref('neutral') // 默认情绪是中性
const audioRef = ref(null)
const audioTimer = ref(null)
const isTalk = ref(false)// 是否正在说话
const lineBusy = ref(false) // 自动语音正在通话中
let sendLoading = ref(false)
let audioVisual = null // 音波
let vadRef = ref(null)
let VadFlag = ref(false)
let recorder = null;
let deviceTimer = ref(null) //  检测设备定时器
let deviceInline = ref(false) // 检测设备是否在线
/*******************************************props******************************/
const emit = defineEmits(['update:autoInputVoice'])
const props = defineProps({
  autoInputVoice: {
    //  自动语音
    type: Boolean,
    default: false
  },
  curVoiceRole: {
    //  当前说话角色
    type: String,
    default: 'user'  // user |mechine   
  }
})
/*********************************工作流***********************************/
const startRecorder = async () => {
  //  开始录音
  try {
    if (!deviceInline.value) {
      throw new Error("没有录音设备");
    }
    await recorder.start()
    isTalk.value = true
  } catch (error) {
    if (error.message == '没有录音设备') {
      toastRef.value.show({
        message: '没有找到录音设备',
        type: 'error'
      })
    }
  }
}
const stopRecorder = async () => {
  try {
    //  停止录音
    await recorder.stop();
    //  改变按钮状态
    isTalk.value = false
  } catch (error) {
    console.log(error)
  }
}

const startVad = async () => {
  // 开始Vad检测
  try {
    lineBusy.value = true
    await vadRef.value.start()
  } catch (error) {
    console.log(error)
    if (!vadRef.value) {
      await initVad()
    }
  }

}
const stopVad = async () => {
  //  停止vad检测
  try {
    await vadRef.value.pause()
    VadFlag.value = false
  }
  catch (error) {
    console.log(error)
    if (!vadRef.value) {
      await initVad()
    }
  }
}

const startASR = async () => {
  // 开启ASR
  multi_model_ws.sendMessage('voiceASR')
}
const stopASR = async () => {
  //  停止ASR
  multi_model_ws.sendMessage('voiceInputByBufferEnd')
}
const startAgent = async () => {
  console.log('startAgent')
  //  开启智能体
  if (input.value !== '') {
    // 如果有输入，则发送智能体
    multi_model_ws.sendMessage('voiceInputByText', {
      asr_text: input.value
    });
    input.value = ''
    toastRef.value.show({
      message: 'AI正在思考中',
      type: 'success'
    })
  }
}
const stopAgent = async () => {
  // 停止智能体
  multi_model_ws.sendMessage('voiceStopAgent')
}
const startAudioPlayer = () => {
  // 开发播放音频
  if (isAudioPlaying.value || receiveAudioStream.value.length === 0) return
  isAudioPlaying.value = true
  const data = receiveAudioStream.value.shift()
  if (audioPlayer.value && data?.tts_audio) {
    let sourceDOM = document.createElement("source");
    sourceDOM.src = data?.tts_audio
    audioPlayer.value.appendChild(sourceDOM)
    audioPlayer.value.src = data?.tts_audio
    // 播放音频
    audioPlayer.value.play().catch((err) => {
      console.error('播放失败:', err);
      isAudioPlaying.value = false; // 播放失败时重置状态
    });
  }
}
const stopAudioPlayer = () => {
  // 结束播放音频
  if (!audioPlayer.value) return
  audioPlayer.value.src = ''
  audioPlayer.value?.pause();
  receiveAudioStream.value = []
  while (audioPlayer.value.firstChild) {
    audioPlayer.value.removeChild(audioPlayer.value.firstChild);
  }
  isAudioPlaying.value = false;
}


/****************************事件*************************************/
const clickKeyBoard = () => {
  //  关掉自动发送
  autoSend.value = false
  // 关掉自动语音
  emit('update:autoInputVoice', false)
  lineBusy.value = false
  stopAudioPlayer()
  stopVad()
  stopASR()
  stopAgent()
  stopRecorder()
  curVoiceRole.value = 'user'
}
const handleChangeAutoSend = (val) => {
  //  没有检测到录音设备不能打开自动发送
  if (val && !deviceInline.value) {
    autoSend.value = false
    toastRef.value.show({
      message: '没有找到录音设备',
      type: 'error'
    })
  } else {
    autoSend.value = val
  }
}
watch(() => props.autoInputVoice, () => {
  //  没有检测到录音设备不能打开自动语音
  if (!deviceInline.value) {
    emit('update:autoInputVoice', false)
    toastRef.value.show({
      message: '没有找到录音设备',
      type: 'error'
    })
  }
  lineBusy.value = false
  stopAudioPlayer()
  stopVad()
  stopASR()
  stopAgent()
  stopRecorder()
})

const handleStartTalk = async () => {
  //  点击开始说话
  curVoiceRole.value = 'user'
  stopAgent()
  startRecorder()
  startASR()
}
const handleStopTalk = async () => {
  //  点击结束
  await stopRecorder()
  stopASR()
  if (input.value == null || input.value == '') {
    return
  }
  if (autoSend.value) {
    sendLoading.value = true
    setTimeout(() => {
      startAgent()
    }, 1000);
    setTimeout(() => {
      sendLoading.value = false
    }, 2000)
  }
}
const handleCall = async () => {
  curVoiceRole.value = 'user'
  stopAgent()
  startRecorder()
  startVad()
}
const handleHangUp = async () => {
  lineBusy.value = false
  await stopVad()
  await stopASR()
  await stopAgent()
  await stopRecorder()
  await stopAudioPlayer()
  curVoiceRole.value = 'user'
}
/**************************钩子函数*****************************/
onMounted(async () => {
  //  检测录音设备
  initDevice()
  //  初始化录音器
  initRecorder()
  //   初始化音波
  initAudioVisual()
  // 设置播放器
  initAudioPlayer()
  //  初始化vad检测
  initVad()
  //   获取websocket智能体回答
  voiceInputByTextMitt()
  //  获取websocket语音识别
  voiceASRMitt()
})

onUnmounted(() => {
  audioPlayer.value?.removeEventListener('ended', () => {
    isAudioPlaying.value = false;
  });
  //  清除录音设备监听事件
  navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  // 清除录音
  recorder?.destroy().then(function () {
    recorder = null;
  });
  //  清除vad
  vadRef.value?.destroy()
})

const initDevice = async () => {
  let devices = await navigator.mediaDevices.enumerateDevices()
  if (devices.filter(device => device.kind === 'audioinput')?.length > 0) {
    deviceInline.value = true
  } else {
    deviceInline.value = false
  }
  navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
}
// 监听设备变化
function handleDeviceChange(e) {
  //  防抖，执行最后一次
  if (deviceTimer.value !== null) {
    clearTimeout(deviceTimer.value)
  }
  deviceTimer.value = setTimeout(() => {
    // 检查设备是否重新连接
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        if (audioDevices.length > 0) {
          toastRef.value.show({
            message: '检测到麦克风设备已连接',
            type: 'success'
          })
          deviceInline.value = true
          //  重新初始化vad
          initVad()
          //  重新初始化录音器
          initRecorder()
        } else {
          deviceInline.value = false
          toastRef.value.show({
            message: '未检测到麦克风设备',
            type: 'error'
          })
        }
      })
      .catch(error => {
        deviceInline.value = false
        console.error('枚举设备失败:', error);
      });
  }, 1000)
}

const initRecorder = async () => {
  try {
    //  录音器
    recorder = await new Recorder({
      sampleBits: 16,                 // 采样位数，支持 8 或 16，默认是16
      sampleRate: 16000,              // 采样率，支持 11025、16000、22050、24000、44100、48000，根据浏览器默认值，我的chrome是48000
      numChannels: 1,                 // 声道，支持 1 或 2， 默认是1
      compiling: true, //(0.x版本中生效,1.x增加中)  // 是否边录边转换，默认是false
    });
    recorder.onprogress = async function (params) {
      let arrayBuffer = params.data.pop().buffer
      let buffer = new Uint8Array(arrayBuffer)
      // 降低采样率
      let newBuffer = audioVisual.downSampleAudio(buffer, 256, 0.2)
      //  绘制波形
      console.log(newBuffer)
      audioVisual.draw(newBuffer)
      if (props.autoInputVoice) {
        //  自动检测时，检测到vad为true时才传buffer数据
        if (VadFlag.value) {
          // 传输数据
          multi_model_ws.sendMessage('voiceInputByBuffer', { file: buffer })
        }
      } else {
        // 传输数据
        multi_model_ws.sendMessage('voiceInputByBuffer', { file: buffer })
      }
    }
  } catch (error) {
  }

}
const initAudioVisual = () => {
  // 初始化音波
  audioVisual = new AudioVisual({
    container: audioRef.value,
    lineColor: '#409EFF',
    shadowColor: '#fff',
    lineSpacing: 4,
    isCreateAudio: false,
  });
}
const initAudioPlayer = () => {
  // 设置播放器
  if (audioPlayer.value) {
    audioPlayer.value.controls = false
    audioPlayer.value.style.display = 'none'; // 隐藏音频元素
    audioPlayer.value.autoplay = true;
    audioPlayer.value.loop = false;//禁止循环，否则无法触发ended事件
    //  设置监听器
    audioPlayer.value.addEventListener('ended', () => {
      isAudioPlaying.value = false;
      startAudioPlayer();
    });
  }
}
const initVad = async () => {
  try {
    vadRef.value = await MicVAD.new({
      initOnLoad: true,
      startOnReady: true,
      onSpeechStart: () => {
        console.log('Speech detected')
        if (!VadFlag.value) {
          VadFlag.value = true
          //  前端检测vad开始，后端检测vad结束，后端会返回4008状态表示vad识别结束。
          multi_model_ws.sendMessage('voiceASR', { vad: true, silence_time: 800 })
        }
      },
      onSpeechEnd: (audio) => {
        console.log('Silence detected')
      },
      ortConfig: (ortInstance) => {
        ortInstance.env.logLevel = "error"
      },
    })
  } catch (error) {
    console.log(error)
  }
}

const voiceInputByTextMitt = () => {
  //  获取智能体回答
  mitt.off("voiceInputByText")
  mitt.on("voiceInputByText", (data) => {
    if (!data) return
    const { socket_message, output_type, socket_status } = data
    //  智能体状态
    handleMessage(socket_message, socket_status)
    if (output_type) {
      switch (output_type) {
        case 'llm': receiveTextStream.value.push(data); break;
        case 'tts': {
          receiveAudioStream.value.push(data)
          //  开始播放音频
          startAudioPlayer()
        }; break;
        case 'emotion':
          emotion.value = data.emotion_output; break;
        default: break;
      }
    }
  })
}
const voiceASRMitt = () => {
  // 获取语音识别
  mitt.off("voiceASR")
  mitt.on("voiceASR", (data) => {
    if (!data) return
    switch (data.socket_status) {
      case 4008:
        //  vad检测语音结束
        setTimeout(() => {
          if (input.value == ''||input.value==null) {
            toastRef.value.show({
              message: '没有识别到语音',
              type: 'info'
            })
            lineBusy.value = false
          }
          if (lineBusy.value) {
            startAgent()
          }
        }, 1000)
        //  检测到说话结束
        stopRecorder()
        stopVad()

        break;
      case 1004:
        // 有结果输出
        input.value = data.socket_data.text
        break;
      case 3001:
        toastRef.value.show(data.socket_data.error)
        break;
      case 3002:
        //  积分不足以提问，请充值
        toastRef.value.show({
          message: '积分不足以提问，请充值',
          type: 'warning'
        })
        stopVad()
        stopRecorder()
        stopAgent()
        stopAudioPlayer()
        break;
      default: break;
    }
  })
}

/*****************************************语音处理**************************************************/
watch(() => receiveTextStream.value.length, (oldVal, newVal) => {
  if (receiveTextStream.value.length == 0) return
  //  如果接口流不为空说明是AI回答
  const data = receiveTextStream.value.shift()
  output.value += data?.llm_response || ""
}, { deep: true, immediate: true })

//  角色样式切换
const activeRoleAvater = computed(() => {
  return (role) => {
    return role === curVoiceRole.value ? 'active-avater' : 'inactive-avater'
  }
})
const activeRoleCard = computed(() => {
  return (role) => {
    return role === curVoiceRole.value ? 'active-card' : 'inactive-card'
  }
})

const messageKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
  }
}
// 点击手动发送
const handleSendText = async () => {
  console.log(input.value, 'input.value')
  if (!sendLoading.value) {
    if (input.value === '') {
      toastRef.value.show({
        message: '说点什么吧~',
        type: 'warning'
      })
      return
    }
    sendLoading.value = true
    if (isTalk.value) {
      await stopRecorder()
      stopASR()
    }
    curVoiceRole.value = 'machine'
    startAgent()

    setTimeout(() => {
      sendLoading.value = false
    }, 2000)
  }
}
const handleInterruption = () => {
  //  中断回复
  curVoiceRole.value = 'user'
  stopAgent()
}
const clearMechine = () => {
  //  清理AI数据
  input.value = ''
  output.value = ''
  stopAudioPlayer()
  receiveAudioStream.value = []
}
watch(() => curVoiceRole.value, () => {
  if (curVoiceRole.value === 'user') {
    // 清空ai数据
    clearMechine()
  }
}, { deep: true, immediate: true })
const handleMessage = (socket_message) => {
  switch (socket_message) {
    case 'agent_event':
      // 智能体正在回答
      AgentState.value = 'active';
      // 主动转化成mechine
      curVoiceRole.value = 'machine'
      break;
    case 'operation_completed':
      // 智能体正在语音识别
      AgentState.value = 'asr';
      break;
    case 'agent_stop':
      // 智能体关闭，回答结束
      AgentState.value = 'stop';
      setTimeout(() => {
        // 智能体返回可能没有音频,所以没有音频的情况下等待3秒后切换回user
        if (!isAudioPlaying.value) {
          //  情况内容
          clearMechine()
          if (props.autoInputVoice) {
            //用户手动挂断，不继续自动语音
            if (lineBusy.value) {
              handleCall()
            } else {
              handleHangUp()
            }
          }
          curVoiceRole.value = 'user'
        }
      }, 3000)
      break;
    case 'insufficient_balance':
      toastRef.value.show({
        message: '积分不足以提问，请充值',
        type: 'warning'
      })
      stopVad()
      stopRecorder()
      stopAgent()
      stopAudioPlayer()
    default: break;
  }
}
watch(() => isAudioPlaying.value, (newVal, oldVal) => {
  if (AgentState.value !== 'stop') return
  if (newVal === false && oldVal === true) {
    console.log('音频结束')
    //  当结束音频时，则转化为user
    if (audioTimer.value !== null) {
      clearTimeout(audioTimer.value)
    }
    audioTimer.value = setTimeout(() => {
      curVoiceRole.value = 'user'
      if (lineBusy.value && props.autoInputVoice) {
        //用户手动挂断，不继续自动语音
        handleCall()
        return
      }
    }, 1000)

  }
})

/*********************************************偏好设置**************************************************/
const getAvater = computed(() => {
  //  获取头像
  const emotionList = preference.character?.character_visualDesign?.animation_assets || {}
  if (Object.keys(emotionList).length !== 0) {
    if (emotionList[`${emotion.value}_gif`]) {
      // 优先显示动图
      return { type: 'video', url: emotionList[`${emotion.value}_gif`] }
    } else if (emotionList[emotion.value]) {
      // 没有动图，则显示静态图
      return { type: 'image', url: emotionList[emotion.value] }
    } else if (emotionList['neutral']) {
      //  没有指定的表情的静态图，则使用neutral图
      return { type: 'image', url: emotionList['neutral'] }
    } else {
      //  中性图也没有，则显示第一个
      return { type: 'image', url: emotionList[0] }
    }
  } else {
    return { type: 'image', url: new URL('../../../assets/temp.png', import.meta.url).href }
  }
})
//  获取用户头像
const getUserAvater = computed(() => {
  if (preference.userFile?.user_visualDesign?.animation_assets?.default_gif) {
    return { type: 'video', url: preference.userFile?.user_visualDesign?.animation_assets?.default_gif }
  } else if (preference.userFile?.user_visualDesign?.animation_assets?.default) {
    return { type: 'image', url: preference.userFile?.user_visualDesign?.animation_assets?.default }
  } else {
    return { type: 'image', url: new URL('../../../assets/temp.png', import.meta.url).href }
  }
})
</script>
<style lang="scss" scoped>
@import url('@/components/VoiceInteraction/index.scss');

.voice-content-box {
  position: relative;
  top: 30px;
  left: 0;

  .voice-avater {
    display: flex;
    justify-content: space-between;
    margin: 30px 80px 86px;

    .avater {
      width: 256px;
      height: 342px;
      position: relative;

      img {
        width: 100%;
        height: 100%;
        border-radius: 25px 25px 25px 25px;
      }

      video {
        width: 100%;
        height: 100%;
        border-radius: 25px 25px 25px 25px;
      }
    }

    .active-avater {
      background: initial;
      opacity: 1;
      transform: scale(1.2);
      position: relative;
      z-index: 3;
      transition: transform .5s ease-in-out;
    }

    .inactive-avater {
      background: #4D4D4D;
      opacity: 0.87;
      position: relative;
      z-index: 1;
      filter: grayscale(10%) brightness(50%);
      transition: transform .5s ease-in-out, filter .5s ease-in-out;
    }
  }

  .voice-mode {
    width: 250px;
    z-index: 10;

    .voice-siri-wave {
      width: 200px;
      height: 200px;
      margin: 0 auto;
    }

    .click-talk-btn {
      width: 203px;
      height: 76px;
      margin: 0 auto;
      background-image: url('@/assets/voice/talk-btn.png');
      background-size: cover;
      color: #fff;
      font-family: Microsoft YaHei, Microsoft YaHei;
      font-weight: 400;
      font-size: 20px;
      text-align: center;
      font-style: normal;
      text-transform: none;
      vertical-align: middle;

      div {
        padding: 20px;
      }
    }

    .voice-talking {
      height: 76px;
      width: 76px;
      margin: 0 auto;
      background-image: url('@/assets/voice/hangUp-btn.png');
      background-size: cover;
      cursor: pointer;
    }

    .voice-hangUp {
      height: 76px;
      width: 76px;
      margin: 0 auto;
      background-image: url('@/assets/voice/call-btn.png');
      background-size: cover;
      cursor: pointer;
    }

    .voice-mode-send {
      text-align: center;
      color: #7D7D7D;
    }
  }

  .text-content-box {
    margin: 0 50px;
    position: relative;
    left: 0;
    top: 0;

    .text-card {
      box-shadow: 0px 3px 6px 1px rgba(0, 0, 0, 0.16);
      border-radius: 25px;
      margin: 12px 0 10px;
      padding: 10px;
      width: 100%;
      position: absolute;
    }

    :deep(.input .el-textarea__inner) {
      box-shadow: none;
      margin: 10px 0;
      padding: 10px;
      color: #041C95;
      font-weight: 400;
      font-size: 18px;
    }

    .text-output-box {
      :deep(.input .el-textarea__inner) {
        color: #333;

        &::-webkit-scrollbar {
          width: 5px;
          /* 纵向滚动条*/
          height: 5px;
          /* 横向滚动条 */
          background-color: transparent;
        }

        /*定义滚动条轨道 内阴影*/
        &::-webkit-scrollbar-track {
          box-shadow: inset 0 0 6px rgba(0, 0, 0, 0);
          background-color: transparent;
        }

        /*定义滑块 内阴影*/
        &::-webkit-scrollbar-thumb {
          box-shadow: inset 0 0 6px rgba(0, 0, 0, 0);
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
        }
      }
    }

    .active-card {
      left: -10px;
      top: 0px;
      background-color: rgba(255, 255, 255, .95);
      z-index: 10;
      transition: left .5s ease-in-out, top .5s ease-in-out;
    }

    .inactive-card {
      left: 10px;
      top: -10px;
      z-index: 1;
      transition: left .5s ease-in-out, top .5s ease-in-out;
      background-color: rgba(0, 0, 0, 0.10);

      :deep(.input .el-textarea__inner) {
        background-color: transparent;
      }
    }

    .send-btn {
      display: flex;
      justify-content: flex-end;
      margin-right: 20px;
    }
  }

}
</style>