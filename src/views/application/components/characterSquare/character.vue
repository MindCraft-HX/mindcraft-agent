<template>
  <div class="find">
    <div class="title">
      <el-button style="margin-right: 12px;" plain type="primary" @click="returnList" v-if="showCharacterDetail">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-fanhui1"></div>返回</el-button>
      {{ pageName }}
      <el-radio-group style="margin-left: 12px;" v-model="type" @change="getCharacterList(1)" v-if="!showCharacterDetail">
        <el-radio-button label="我的创建" value="user" />
        <el-radio-button label="我的关注" value="follow" />
      </el-radio-group>
    </div>
    <characterInfo v-model:character="characterDetail" v-if="showCharacterDetail">
      <template v-slot:btn>
        <el-button style="margin: 5px;" plain type="primary" @click="editCharacter" v-if="characterDetail.is_owner">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-bianji"></div>编辑</el-button>
        <el-button style="margin: 5px;" plain type="primary" @click="copyCharacter">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-fuzhi1"></div>复制</el-button>
        <el-button style="margin: 5px;" plain type="primary" @click="shareCharacter">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenxiang"></div>{{ !characterDetail.is_share ? '分享' : '取消分享'}}</el-button>
        <el-button style="margin: 5px;" plain type="primary" @click="deleteCharacter" v-if="characterDetail.is_owner">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-delete"></div>删除</el-button>
        <!-- <el-button style="margin: 5px;" plain type="primary" @click="returnList">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-fanhui1"></div>返回</el-button> -->
      </template>
    </characterInfo>
    <template v-else>
      <div style="display: flex;align-items: center;">
        <el-text>排序：</el-text>
        <el-button size="small" style="margin: 6px 0;width: fit-content;" type="primary" icon="Sort" plain @click="sort = !sort; getCharacterList(1)">{{sort ? '由旧到新' : '由新到旧'}}</el-button>
      </div>
      <div class="character-list" v-infinite-scroll="getCharacterList" :infinite-scroll-disabled="disabled" :infinite-scroll-immediate="true" infinite-scroll-distance="0">
        <characterThumb v-for="item, index in characterList" :key="index" v-model:character="characterList[index]" @onSelect="openCharacterDetail"></characterThumb>
        <el-text class="loading-tips" v-if="loading">加载中...</el-text>
        <el-text class="loading-tips" v-else-if="finish">没有更多角色了</el-text>
        <el-text class="loading-tips" style="cursor: pointer;" v-else @click="getCharacterList">点击加载更多</el-text>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, h } from "vue";
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();
import characterInfo from "@/views/application/components/characterSquare/components/characterInfo.vue";
import characterThumb from "@/views/application/components/characterSquare/components/characterThumb.vue";
import { apiGetCharacterList } from "@/api/application/character"
const characterList = ref([]);
const size = ref(20)
const page = ref(1)
const loading = ref(false)
const maxPages = ref(1)
const disabled = computed(() => loading.value || finish.value)
const finish = computed(() => maxPages.value <= page.value);
const type = ref("user")
const sort = ref(false)
const getCharacterList = (init = 0) => {
  if (loading.value) return;
  if (page.value > maxPages.value) return;
  loading.value = true
  if(init == 1) {
    characterList.value = []
    maxPages.value = 1
    page.value = 1
  } else {
    page.value += 1
  }
  apiGetCharacterList({
    size: size.value,
    page: page.value,
    data_type: type.value,
    sort: sort.value ? "character_id" : "-character_id",
  }).then(res => {
    console.log(res)
    characterList.value = [...characterList.value, ...(res?.data?.results || [])]
    maxPages.value = res?.data?.max_pages || 1
  }).finally(() => {
    loading.value = false
  })
}
getCharacterList(1)
const returnList = () => {
  showCharacterDetail.value = false
  getCharacterList(1)
}

const pageName = computed(() => {
  return showCharacterDetail.value ? '角色详情' : '我的角色'
})

const characterDetail = ref({})
const showCharacterDetail = ref(false)
const openCharacterDetail = (item) => {
  characterDetail.value = item
  showCharacterDetail.value = true
}

const editCharacter = () => {
  mitt.emit("changeSidebar", {tab: 1, editId: characterDetail.value.character_id})
  // mitt.emit("updateCharacter", characterDetail.value.character_id)
}

import { apiCopyCharacter } from "@/api/application/character.js"
import api from "@/utils/request";
import { ElProgress, ElNotification, ElText, ElMessageBox, ElMessage  } from "element-plus";
const copyCharacter = async () => {
  const progressPercent = ref(0)
  const characterName = ref("--")
  const notice = ElNotification({
    title: `复制角色${characterDetail.value.character_name}`,
    duration: 0,
    // Should pass a function if VNode contains dynamic props
    message: () => 
      progressPercent.value >= 100 ? 
      [
        h(ElText, {type: 'success'}, `成功复制角色“${characterDetail.value.character_name}”，新角色名：${characterName.value}。`),
        h('br'),
        h(ElText, {type: 'info'}, '请在“我的AI角色”——“我的创建”中查看')
      ]
      : 
      h(ElProgress, {
        percentage: progressPercent.value.toFixed(2),
        striped: true,
        stripedFlow: true,
      })
  })

  try {
    await api.post(`/v1/character/${characterDetail.value.character_id}/copy/`, {noLoading: 1}, {
      responseType: "stream",
      onDownloadProgress: (progressEvent) => {
        const chunk = progressEvent.event.currentTarget.response
        const data = chunk.split(/\n\n/g).map(i => i.split("data:")[1]).filter(i => i)
        data.map(item => {
          let info = {}
          try {
            info = JSON.parse(item)
          } catch (error) {
            console.warn(error, item)
            return item
          }
          console.log(info)
          if(info.progress_percent) {
            progressPercent.value = info.progress_percent * 100
          }
          if(info.to_name) {
            characterName.value = info.to_name
          }
          return item
        })
      }
    });
  } catch (error) {
    notice?.close()
    ElMessage.error(error?.response?.data?.message || "复制角色失败")
  }
}

import { apiDeleteCharacter } from "@/api/application/character"
const deleteCharacter = () => {
  ElMessageBox.confirm("确认删除？", {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning',
  })
  .then(() => {
    apiDeleteCharacter(characterDetail.value.character_id).then(res => {
      ElMessage.success('删除成功')
      returnList()
    }).catch(err => {
      console.log(err)
      ElMessage.error(err?.response?.data?.message || "删除异常")
    })
  })
}

import { apiSaveCharacter } from "@/api/application/character"
const shareCharacter = () => {
  apiSaveCharacter({is_share: !characterDetail.value.is_share}, characterDetail.value.character_id).then(res => {
    characterDetail.value.is_share = !characterDetail.value.is_share
    ElMessage.success(characterDetail.value.is_share ? '分享成功' : '取消分享成功')
  }).catch(err => {
    console.log(err)
    ElMessage.error(err?.response?.data?.message || "分享异常")
  })
}
</script>

<style lang="scss" scoped>
.find {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
  .title {
    color: #107EFE;
    font-size: 20px;
    padding: 6px 26px;
    padding-left: 12px;
    border-bottom: 2px solid #107EFE;
    display: flex;
    align-items: center;
  }
  .character-list{
    width: 100%;
    height: 100%;
    display: flex;
    flex-wrap: wrap;
    align-content: baseline;
    overflow: auto;
    &::-webkit-scrollbar-track {
      display: none;
    }
    &::-webkit-scrollbar {
      width: 5px;
    }
    &::-webkit-scrollbar-thumb {
      display: none;
      width: 5px;
      background-color: #3333332f;
      border-radius: 5px;
    }
    &::-webkit-scrollbar-corner{
      display: none;
    }

    &:hover{
      &::-webkit-scrollbar-thumb {
        display: block;
      }
    }

    .loading-tips{
      width: 100%;
      text-align: center;
    }
  }
}
</style>