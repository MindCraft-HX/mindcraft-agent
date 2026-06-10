import { defineStore } from "pinia";

export const useVoicePreferenceStore = defineStore("voicePreference", {
  state: () => {
    return {
      character: {},
      userFile: {},
      emotion_output: true,// 情绪识别
      set_max_tokens: true,//  设置最大回复限制
      max_tokens: 100, // 最大回复限制
      agent_name:'chat_bot_v3',// 模型
      language:'',// 语言，默认不开启
      llm_model:'',
      tts_model:''
    }

  },
  persist: {
    enabled: true, // true 表示开启持久化保存
  },
});
