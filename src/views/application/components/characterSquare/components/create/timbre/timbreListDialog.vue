<template>
  <el-dialog style="border-radius: 24px;" v-model="dialogVisible" title="添加音色" width="60%" @close="closeDialog" @open="openDialog">
    <template v-if="props.type && props.type != 'voice_default'">
      排序： <el-tag style="cursor: pointer;" :type="sort == 'clone_id' ? 'info' : 'primary'" @click="changeSort">{{ sort == "clone_id" ? "由旧到新" : "由新到旧" }}</el-tag>
    </template>
    <el-scrollbar max-height="50vh">
      <div class="voice-list">
        <el-card @click="chooseVoice(item)" shadow="hover" class="voice-item" :class="{ 'voice-item-selected': item.voice_id == selectVocie.voice_id }" v-for="item, index in voiceList" :key="index">
          <div class="voice-item-top">
            <el-text size="large" class="voice-item-name">{{ item.voice_name }}</el-text>
            <el-button class="voice-item-play" link circle @click.stop="playVideo(item)">
              <svg style="font-size: 30px;" class="icon" aria-hidden="true">
                <use :xlink:href="item.voice_audio != playVideoUrl ?'#icon-mindcraft-bofang' : '#icon-mindcraft-zanting'"></use>
              </svg>
            </el-button>
          </div>
          <div class="voice-item-tags">
            <el-tag type="primary" v-for="tag, tagIndex in item.voice_tags" :key="tagIndex">{{ tag }}</el-tag>
          </div>
          <div class="voice-item-desc">{{ item.voice_description }}</div>
        </el-card>
      </div>
    </el-scrollbar>
    <el-pagination v-if="props.type !== 'voice_default'" style="margin: 20px auto;justify-content: center;" background layout="prev, pager, next" v-model:page-size="size" :total="pagination.count" @change="changePage"/>
    <template #footer>
      <el-button type="primary" @click="confirm">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, inject, computed, nextTick } from "vue"
const character = inject("character")

const props = defineProps(["show", "type", "select"])
const emit = defineEmits(["update:show", "update:select"])

const dialogVisible = computed({
  get:() => {
    return props.show
  },
  set:(val) => {
    emit("update:show", val)
  }
})

import { apiGetVoiceList } from "@/api/application/character.js"
import { ElMessage } from "element-plus"
const voiceList = ref([])
const page = ref(1)
const size = ref(9)
const sort = ref("clone_id")
const pagination = ref({
  count: 0,
  current_page: 1,
  max_pages: 0,
})
const getVoiceList = async (init = 0) => {
  try {
    if(init) {
      voiceList.value = []
      page.value = 1
      pagination.value = {
        count: 0,
        current_page: 1,
        max_pages: 0,
      }
    }
    const res = await apiGetVoiceList({
      page: page.value,
      size: size.value,
      sort: sort.value,
      type: props.type || "voice_default"
    })
    voiceList.value = res?.data?.results || []
    pagination.value = {
      count: res?.data?.count || 0,
      current_page: res?.data?.current_page || 1,
      max_pages: res?.data?.max_pages || 0,
    }
    initSelectVoice()
  } catch (error) {
    console.log(error)
  }
}
defineExpose({getVoiceList})

const openDialog = () => {
  getVoiceList(1)
}
const changeSort = () => {
  sort.value = sort.value == 'clone_id' ? '-clone_id' : 'clone_id'
  getVoiceList(1)
}
const changePage = (e) => {
  console.log(e)
  page.value = e
  getVoiceList()
}

const closeDialog = () => {
  if (normalAudioRef.value) normalAudioRef.value.pause();
  normalAudioRef.value = null
  playVideoUrl.value = "无"
}
const selectVocie = computed({
  get:() => {
    return props.select
  },
  set:(val) => {
    emit("update:select", val)
  }
})
const initSelectVoice = () => {
  if(character.value?.voice_data?.voice_id){
    voiceList.value.map(item => {
      if(item.voice_id == character.value?.voice_data?.voice_id) {
        selectVocie.value = item
      }
    })
  }
}
const chooseVoice = (item) => {
  selectVocie.value = item
  character.value.voice_data = selectVocie.value
}
const normalAudioRef = ref(null);
const playVideoUrl = ref('无');
const playVideo = (item) => {
  if (normalAudioRef.value) normalAudioRef.value.pause();
  if (item.voice_audio) {
    if (playVideoUrl.value == item.voice_audio) {
      playVideoUrl.value = '无';
    } else {
      playVideoUrl.value = item.voice_audio;
      normalAudioRef.value = new Audio(playVideoUrl.value);
      normalAudioRef.value.onended = () => {
        playVideoUrl.value = '无';
        normalAudioRef.value.pause();
      }
      normalAudioRef.value.onerror = () => {
        console.log("播放出错");
        ElMessage.error("播放出错");
        playVideoUrl.value = '无';
        normalAudioRef.value.pause();
      }
      nextTick(() => {
        normalAudioRef.value.play();
      })
    }
  }
};
const confirm = () => {
  if(selectVocie.value.voice_id){
    character.value.voice_data = selectVocie.value
  }
  dialogVisible.value = false
}
</script>

<style lang="scss" scoped>
.voice-list{
  display: flex;
  flex-wrap: wrap;
  .voice-item{
    border: 1px solid rgb(242, 243, 245);
    cursor: pointer;
    border-radius: 16px;
    margin: 12px;
    min-width: 28%;
    width: 28%;
    &.voice-item-selected{
      border: 1px solid #107EFE;
    }
    .voice-item-top{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      .voice-item-name{
        font-weight: 600;
      }
    }
    .voice-item-tags{
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      .el-tag{
        margin: 2px;
      }
    }
    .voice-item-desc{
      margin-top: 12px;
      font-size: 12px;
      color: #999999;
      height: 36px;
      line-height: 18px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow:hidden;
    }
  }
}
</style>