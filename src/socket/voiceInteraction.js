import { useMitt } from "@/utils/mitt";
import { useVoicePreferenceStore } from '@/stores/voicePreference.js'
const preference = useVoicePreferenceStore()
const mitt = useMitt();

const voiceInteraction = [
  {
    socketName: 'voiceConnect',
    processor: (res) => {
      mitt.emit('voiceConnect')
    },
    formatData: (originData) => {
      return originData
    }
  },
  {
    socketName: 'voiceASR',
    processor: (res) => {
      mitt.emit('voiceASR', res)
    },
    formatData: (originData) => {
      const { socket_id, vad = false, silence_time = 800, } = originData
      const { language } = preference
      return {
        socket_type: "agent_event",
        event_name: "stream_asr",
        socket_id: socket_id,
        event_params: {
          model: "ALI_ASR_realtime_paraformer-realtime-v2",
          format: "pcm",
          sample_rate: "16000",
          vad: vad,
          silence_time: silence_time,
          language: language
        }
      }

    }
  },
  {
    //  智能体回答
    socketName: 'voiceInputByText',
    processor: (data) => {
      //  扁平化处理
      let newData = flatData(data)
      function flatData(obj) {
        let res = {}
        for (const i in obj) {
          if (typeof obj[i] === 'object' && obj[i] !== null) {
            const temp = flatData(obj[i])
            for (const j in temp) {
              res[j] = temp[j]
            }
          } else {
            res[i] = obj[i]
          }
        }
        return res
      }
      mitt.emit('voiceInputByText', newData)
    },
    formatData: ({ socket_id, asr_text = "", }) => {
      const { character_id } = preference.character
      const { profile_id } = preference.userFile
      const { emotion_output, max_tokens, agent_name, language, llm_model,tts_model } = preference

      let params = {
        socket_type: 'agent_event',
        event_name: 'agent_action',
        socket_id: socket_id,
        event_params: {
          agent_name: agent_name,
          asr_text: asr_text, // 对话内容
          profile_id: profile_id, // 档案ID
          llm_model: llm_model,// 聊天模型
          tts_model:tts_model,// 语音模型
          history_length: 20, // 历史记录长度
          character_id: character_id, // 角色UUID 
          emotion_output: emotion_output,
          max_tokens: max_tokens, // 最大回复限制,
          language: language,
        }
      }
      return params
    }
  },
  {
    socketName: 'voiceInputByBuffer',
    processor: (data) => {
      console.log(data, '====voiceInputByBuffer')
    },
    formatData: (data) => {
      return {
        sendOriginalData: true,
        DATA: data.file
      }
    }
  },
  {
    socketName: 'voiceInputByBufferEnd',
    processor: (data) => {
      console.log(data, '====voiceInputByBufferEnd')
    },
    formatData: (data) => {
      console.log(data, '====')
      return {
        socket_id: data.socket_id,
        socket_type: "intervent_event",
        event_name: "stream_asr"
      }
    }
  },
  {
    socketName: 'voiceStopAgent',
    processor: (data) => {
      console.log(data, 'voiceStopAgent')
    },
    formatData: (data) => {
      return {
        socket_id: data.socket_id,
        socket_type: "intervent_event",
        event_name: "stream_output"
      }
    }
  }
]

export {
  voiceInteraction
};