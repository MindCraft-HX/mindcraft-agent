<!-- 功能设置弹窗页面 -->
<template>
  <div class="function-setting-drawer">
    <el-drawer v-model="drawer" direction="rtl" title="功能设置" :before-close="handleClose" :append-to-body="false"
      :lock-scroll="false">
      <el-form :model="voicePreferenceStore" label-width="120px" style="max-width: 600px" label-position="left">
        <el-form-item label="语音情绪渲染">
          <el-switch v-model="voicePreferenceStore.emotion_output"
            style="--el-switch-on-color: #45d430; --el-switch-off-color:  #7d7d7d" />
        </el-form-item>
        <el-form-item label="最大回复限制">
          <div class="max-answer-limit">
            <el-switch v-model="voicePreferenceStore.set_max_tokens"
              style="--el-switch-on-color: #45d430; --el-switch-off-color:  #7d7d7d" />
            <el-input class="limit-input" v-model="voicePreferenceStore.max_tokens" type="number"></el-input>
          </div>

        </el-form-item>
        <el-form-item label="智能体">
          <el-select class="select" v-model="voicePreferenceStore.agent_name" placeholder="请选择智能体">
            <el-option v-for="(item, index) in agentList" :label="item.name" :value="item.value" :key="index" />
          </el-select>
        </el-form-item>
        <el-form-item label="llm模型">
          <el-select class="select" v-model="voicePreferenceStore.llm_model" placeholder="请选择llm模型">
            <el-option v-for="(item, index) in modelList" :label="item.name" :value="item.value" :key="index" />
          </el-select>
        </el-form-item>
        <el-form-item label="语音模型">
          <el-select class="select" v-model="voicePreferenceStore.tts_model" placeholder="请选择语音模型">
            <el-option v-for="(item, index) in audioModelList" :label="item.name" :value="item.value" :key="index" />
          </el-select>
        </el-form-item>
        <el-form-item label="语种">
          <el-select class="select" v-model="voicePreferenceStore.language" placeholder="请选择语种">
            <el-option v-for="(item, index) in languageList" :label="item.name" :value="item.value" :key="index" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue"
import { useVoicePreferenceStore } from '@/stores/voicePreference.js'
import { apiGetAgent, apiSelctOptions } from '@/api/application/voiceInteraction.js'
const voicePreferenceStore = useVoicePreferenceStore()
const emit = defineEmits(["update:modelValue", "change"])
const props = defineProps({
  pageType: {
    type: Number,
    default: 1
  },
  modelValue: {
    type: Boolean,
    default: false
  },
})
const drawer = ref(props.modelValue)
const agentList = ref([])
const modelList = ref([])
const audioModelList = ref([])
const languageList = ref([])

onMounted(() => {
  apiSelctOptions().then(res => {
    const params_list = res.data.data?.params_list
    const tempModel = params_list.find(e => e.paramName == 'model')
    modelList.value = tempModel.dataRange
    if (voicePreferenceStore.llm_model == '') {
      //设置默认值
      voicePreferenceStore.llm_model = tempModel.dataDefault
    }
    const tempAudioModel = params_list.find(e => e.paramName == 'tts_model')
    audioModelList.value = tempAudioModel.dataRange
    if (voicePreferenceStore.tts_model == '') {
      // 设置默认值
      voicePreferenceStore.tts_model = tempAudioModel.dataDefault
    }
    const tempLang = params_list.find(e => e.paramName == 'language')
    languageList.value = tempLang.dataRange
    if (voicePreferenceStore.language == '') {
      // 设置默认值
      voicePreferenceStore.language = tempLang.dataDefault
    }
  })
  apiGetAgent().then(res => {
    agentList.value = res.data.data
  })
})

watch(() => props.modelValue, (newValue) => {
  drawer.value = newValue
}, { immediate: true })

watch(() => voicePreferenceStore.set_max_tokens, () => {
  if (!voicePreferenceStore.set_max_tokens) {
    voicePreferenceStore.max_tokens = 100
  }
})


const handleClose = (done) => {
  done()
  emit("update:modelValue", false)
}
</script>

<style lang="scss" scoped>
.function-setting-drawer {
  position: absolute;
  right: 0;

  :deep(.el-drawer) {
    background-color: #f2f2f2;
  }

  :deep(.el-overlay) {
    top: 120px;
  }

  :deep(.select .el-select__wrapper) {
    border-radius: 8px;
    box-shadow: 0 0 0 1px #B6B4B4 inset;
  }




  .max-answer-limit {
    display: flex;
    justify-content: flex-start;
    width: 100%;

    .limit-input {
      flex: 1;
      margin-left: 12px;

      :deep(.el-input__wrapper) {
        padding: 1px 10px;
        border-radius: 8px;
        box-shadow: 0 0 0 1px #B6B4B4 inset;
      }
    }


  }

}
</style>