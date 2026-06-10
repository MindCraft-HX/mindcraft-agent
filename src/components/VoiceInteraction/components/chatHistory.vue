<!-- 历史记录 -->
<template>
  <div class="chat-history-drawer">
    <el-drawer v-model="drawer" direction="rtl" title="历史记录" :before-close="handleClose" :append-to-body="false"
      :lock-scroll="false" size="60%">
      <div class="history-box" ref="historyBoxRef" v-loading="loading">
        <div v-for="item in historyDataList" :key="item.message_id">
          <div v-if="item.message_category === 'user'" class="history-user-item">
            {{ item.message_content }}
          </div>
          <div v-if="item.message_category === 'assistant'" class="history-mechine-item">
            {{ item.message_content }}
          </div>
        </div>
      </div>

    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted, nextTick, onMounted } from "vue"
import { apiUserCharacterHistory } from '@/api/application/voiceInteraction.js'
const emit = defineEmits(["update:modelValue", "change"])
import { useVoicePreferenceStore } from '@/stores/voicePreference.js'
const voicePreferenceStore = useVoicePreferenceStore()
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
})
const drawer = ref(props.modelValue)
const historyBoxRef = ref(null)
const loading = ref(false)
const currentPage = ref(-1)// 当前页 ，因为是倒序，当currentPage=1时，则是最后一页
const currentDom = ref(null)
const params = ref({
  size: 10,
  ordering: '-message_id',// 默认按照时间倒序排列 
  before_message_id: null
})
const historyDataList = ref([])
const isFirstLoad = ref(true) // 标志是否是首次加载
const getList = async () => {
  let character_id = voicePreferenceStore.character?.character_id
  if (!character_id) return
  loading.value = true
  let { data } = await apiUserCharacterHistory(character_id, params.value)
  historyDataList.value.unshift(...data.results.reverse())
  currentPage.value = data.max_pages
  nextTick(() => {
    if (isFirstLoad.value) {
      //  首次加载，滚动到底部
      historyBoxRef.value.scrollTop = historyBoxRef.value.scrollHeight;
      isFirstLoad.value = false
    } else {
      // 滚动到顶部后，定位到上一次展示的位置
      currentDom.value && currentDom.value.scrollIntoView()
    }
    loading.value = false
  })

}

onMounted(() => {
  nextTick(() => {
    historyBoxRef.value?.addEventListener("scroll", handleScroll)
  })
})

onUnmounted(() => {
  historyBoxRef.value?.removeEventListener("scroll", handleScroll)
})

watch(() => props.modelValue, (newValue) => {
  drawer.value = newValue
  //  每次打开抽屉，重新拉取数据
  if (newValue) {
    isFirstLoad.value = true
    currentPage.value = -1
    historyDataList.value.length = 0
    params.value = {
      size: 10,
      ordering: '-message_id',// 默认按照时间倒序排列 
      before_message_id: null
    }
    getList()
  }
}, { immediate: true })

const handleScroll = (event) => {
  //  如果滚动到顶部，则加载更多
  if (event.target.scrollTop === 0) {
    // 因为是倒序，当currentPage=1时，则是最后一页
    if (currentPage.value === 1) return
    params.value.before_message_id = historyDataList.value[0]?.message_id
    currentDom.value = historyBoxRef.value?.children[0]
    getList();
  }
}

const handleClose = (done) => {
  done()
  emit("update:modelValue", false)
}
</script>

<style lang="scss" scoped>
@import url('@/components/VoiceInteraction/index.scss');
.chat-history-drawer {
  position: absolute;
  right: 0;

  :deep(.el-drawer) {
    background-color: #f2f2f2;
  }

  :deep(.el-overlay) {
    top: 120px;
  }

  .history-box {
    height: calc(100% - 120px);
    overflow: scroll;

    .history-user-item {
      background: #E6F0FF;
      border-radius: 15px 15px 0px 15px;
      font-weight: 400;
      font-size: 20px;
      color: #041C95;
      width: fit-content;
      margin: 12px 0 12px auto;
      padding-left: 20px;
      padding: 18px;
      max-width: calc(100% - 40px);
    }

    .history-mechine-item {
      background: #DFDDDD;
      border-radius: 15px 15px 15px 0px;
      font-weight: 400;
      font-size: 20px;
      color: #333;
      max-width: auto;
      width: fit-content;
      padding: 18px;
      margin-right: 40px;
    }
  }

}
</style>