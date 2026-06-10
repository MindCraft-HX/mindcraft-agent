<template>
  <div class="identity" v-loading="loading && {text:loadingText}">
    <div class="identity-content">
      <div class="identity-img-content">
        <div class="identity-btn">
          <div style="flex: 1;"></div>
          <div class="live2d-btn" :class="{'gray': !canCreateGif}" @click="confirmCreateMedia(1)" v-show="identityType == 0">
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-shengcheng2Ddonghua"></div>
            生成live2D动画
          </div>
        </div>
        <el-image class="identity-img" :src="assestLink ? assestLink : defaultImg" fit="cover" v-if="!identityType"/>
        <video class="identity-img" autoplay loop muted :src="assestLink" v-else></video>
      </div>
      <div class="img-btn-content">
        <div class="img-btn" :class="{'active': identityType === index}" @click="changeActiveIndex(index)" v-for="item, index in  ['静态立绘', '动态立绘']" :key="index">{{ item }}</div>
      </div>
    </div>
    <div class="operation-btn">
      <div class="operation-btn-item" v-for="item, index in operationList" :key="index" @click="item.fn">
        <div class="operation-btn-item-icon mindcraft-flow-win-iconfont" :class="item.img"></div>
        <div class="operation-btn-item-name">{{ item.name }}</div>
      </div>
      <input type="file" accept="image/*" ref="uploadImg" @change="chooseImg" style="display: none;" />
      <input type="file" accept="video/*" ref="uploadVideo" @change="chooseVideo" style="display: none;" />
    </div>
  </div>
</template>

<script setup>
import { ref, inject, computed, watch, onMounted, h } from 'vue'
import { ElMessage, ElLoading, ElMessageBox, ElText } from 'element-plus'
import defaultImg from '@/assets/characterSquare/characterSquareBG.png'
const character = inject("character")

const emit = defineEmits(["changeSelectTab", "saveCharacter"])

// 立绘类型
const identityType = ref(0) // 0: 静态立绘 1: 动态立绘
const changeActiveIndex = (index) => {
  identityType.value = index
}

// 当前资源地址
const assestLink = computed(() => {
  return character.value?.assests?.[mediaKey.value] || ''
})

const uploadImg = ref(null)
const uploadVideo = ref(null)
const operationList = [
  {
    name: "上传图片",
    img: "icon-mindcraft-shangchuantupian",
    fn: () => {
      uploadImg.value.click()
    }
  },
  {
    name: "上传视频",
    img: "icon-mindcraft-shangchuantupian",
    fn: () => {
      uploadVideo.value.click()
    }
  },
  {
    name: "AI生成形象",
    img: "icon-mindcraft-AIshengchengxingxiang",
    fn: () => {
      confirmCreateMedia(0)
    }
  },
  // {
  //   name: "生成2D动画",
  //   img: "icon-mindcraft-shengcheng2Ddonghua",
  //   fn: () => {
  //     identityType.value = 1
  //     createMediaAuto()
  //   }
  // },
]

// 是否可以创建gif
const canCreateGif = computed(() => {
  return character.value?.assests?.default
})

import { apiCreateUserCharacterPrompt } from "@/api/application/character.js";
const confirmCreateMedia = async (type) => {
  if(type == 1 && !canCreateGif.value) {
    return ElMessage.error('请生成静态立绘')
  }

  /************* 获取提示词 ************/
  try {
    const res = await apiCreateUserCharacterPrompt({
      media_key: type == 0 ? "" : "default_gif",
      image_url: assestLink.value,
    }, character.value.profile_id)
    console.log(res)
    if(res?.data?.data?.appearanceDescription) {
      character.value.appearanceDescription = {
        ...character.value.appearanceDescription,
        ...res?.data?.data?.appearanceDescription
      }
    }
  } catch (error) {
    console.error(error)
    ElMessage.error('获取角色设定异常')
    return
  }
  /************* 获取提示词 ************/

  /************* 确认提示词 ************/
  let prompt = ""
  if(type) {
    prompt = character.value?.appearanceDescription?.default_gif || ""
  } else {
    prompt = character.value?.appearanceDescription?.default || ""
  }
  console.log(prompt)
  await ElMessageBox.prompt(`${type == 0 ? '图片' : 'live2D动画'}提示词`, '请确认并修改提示词', {
      inputValue: prompt,
      inputType: 'textarea',
      customClass: 'character-square-identity-prompt-box',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
    .then(({ value }) => {
      prompt = value

      /************* 确认消耗 ************/
      // 20250408这里积分和时间应老板要求写死豆包时间积分
      const time = type ? 180 : 120
      const price = type ? 3000 : 200
      ElMessageBox({
        title: `即将根据角色设定生成${type == 0 ? '图片' : 'live2D动画'}`,
        message: () =>
        [
          h(ElText, {type: 'info'}, `预计生成时间${time}秒，预计消耗${price}积分`),
          h('br'),
          h(ElText, {type: 'info'}, '确认生成后，中途退出将取消任务，积分不返还')
        ],
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }).then(async () => {
        ElMessage({
          type: 'success',
          message: `创建任务生成成功`,
        })
        identityType.value = type
        createMediaAuto(prompt)
      })
      /************* 确认消耗 ************/
    })
    .catch(() => {
      ElMessage({
        type: 'info',
        message: '取消创建',
      })
    })
  /************* 确认提示词 ************/
}

const chooseImg = async (event) => {
  console.log(event)
  changeActiveIndex(0)
  const file = event.target.files[0];
  if (file) {
    const response = await fetch(URL.createObjectURL(file));
    const blob = await response.blob();
    createMedia({
      blob,
      name: file.name
    })
  }
}

const chooseVideo = async (event) => {
  console.log(event) 
  changeActiveIndex(1)
  const file = event.target.files[0];
  if (file) {
    const response = await fetch(URL.createObjectURL(file));
    const blob = await response.blob();
    createMedia({
      blob,
      name: file.name
    })
  }
}

const mediaKey = computed(() => {
  return !identityType.value ? 'default' : 'default_gif'
})
import { apiCreateUserCharacterMedia } from "@/api/application/character.js";
const createMedia = async (file) => {
  const formData = new FormData()
  formData.append("media_type", "IMAGE")
  formData.append("media_key", mediaKey.value)
  if(file) {
    formData.append("media_file", file.blob, file.name);
  }
  apiCreateUserCharacterMedia(formData, character.value.profile_id)
  .then(res => {
    console.log(res)
    if(!character.value?.assests) character.value.assests = {}
    character.value.assests[mediaKey.value] = res?.data?.data?.media_url
  })
}
import api from "@/utils/request";
const loadingText = ref('请稍后...')
let loadingTimer = null
const loading = ref(false)
const createMediaAuto = async (prompt) => {
  let updateList = []
  clearInterval(loadingTimer)
  loadingTimer = null
  loading.value = true
  let needTime = "--"
  let time = 0
  loadingText.value = '开始生成创建任务...'
  setTimeout(() => {
    loadingText.value = '正在生成中...（请耐心等待）'
  }, 1000)
  try {
    await api.post(`/v1/user/character/${character.value.profile_id}/media_create/`, {
      media_key: mediaKey.value, 
      image_model: window.VITE_NODE_ENV == 'development' ? "cogview-3-flash" : "",
      video_model: window.VITE_NODE_ENV == 'development' ? "cogvideox-flash" : "",
      appearanceDescription: prompt || "",
      image_url: character.value?.assests?.default || "",
      noLoading: 1
    }, {
      responseType: "stream",
      onDownloadProgress: (progressEvent) => {
        const chunk = progressEvent.event.currentTarget.response
        const data = chunk.split(/\n\n/g).map(i => i.split("data:")[1]).filter(i => i)
        // console.log(data)
        updateList = []
        data.map(item => {
          let info = {}
          try {
            info = JSON.parse(item)
          } catch (error) {
            console.warn(error, item)
            return item
          }
          // console.log(info)
          if(!loadingTimer && info.timestamp && info.video_sleep_time) {
            time = (((Date.now() / 1000) - +info.timestamp) / 1000) || 0
            needTime = info.video_sleep_time || "--"
            loadingText.value = `模型预计耗时${needTime}s，实际已耗时${time.toFixed(0)}s，不要离开当前页面`
            loadingTimer = setInterval(() => {
              time += 1
              loadingText.value = `模型预计耗时${needTime}s，实际已耗时${time.toFixed(0)}s，不要离开当前页面`
            }, 1000)
          }
          if(info.media_url) {
            if(!character.value?.assests) character.value.assests = {}
            character.value.assests[info.media_key] = info.media_url
            updateList.push({
              link: info.media_url,
              key: info.media_key
            })
          }
          return item
        })
      }
    });
  } catch (error) {
    ElMessage.error((JSON.parse(error?.response?.data || "{}"))?.message || '生成失败')
  } finally {
    loading.value = false
    clearInterval(loadingTimer)
    loadingTimer = null
    loadingText.value = '请稍后...'
    for (let index = 0; index < updateList.length; index++) {
      const item = updateList[index];
      await changeSave(item)
    }
  }
}

const changeSave = async (options) => {
  console.log(options)
  await apiCreateUserCharacterMedia({
    media_file_url: options.link,
    media_type: "IMAGE",
    media_key: options.key,
  }, character.value.profile_id)
  .then(res => {
    console.log(res)
    emit('saveCharacter', 1)
  })
  .catch(err => {
    ElMessage.error(err?.response?.data?.message || '保存失败') 
  })
}
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.identity{
  display: flex;
  justify-content: space-between;
  padding: 29px 47px;
  width: 100%;
  // height: 100%;
  .identity-content{
    height: 100%;
    display: flex;
    flex-direction: column;
    flex: .5;
    margin-right: 30px;
    .identity-img-content{
      width: 345px;
      position: relative;
      display: flex;
      flex-direction: column;
      border-radius: 18px 18px 0 0;
      overflow: hidden;
      flex-shrink: 0;
      &:hover {
        .identity-btn{
          opacity: 1;
        }
      }
      .identity-btn{
        position: absolute;
        top: 11px;
        left: 14px;
        right: 14px;
        display: flex;
        align-items: center;
        z-index: 1;
        opacity: 0;
        transition: all .3s;
        .gray {
          filter: grayscale(100%);
        }
        .live2d-btn{
          height: 33px;
          width: fit-content;
          display: flex;
          align-items: center;
          flex-shrink: 0;
          background-color: #409EFF;
          border-radius: 16px;
          padding: 0 10px;
          color: #fff;
          cursor: pointer;
          opacity: 0.8;
          &:hover{
            opacity: 1;
          }
          .mindcraft-flow-win-iconfont{
            margin-right: 5px;
          }
        }
      }
      .identity-img{
        width: 345px;
        height: 429px;
        object-fit: cover;
        background-image: url("@/assets/characterSquare/characterSquareBG.png");
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center center;
        user-select: none;
      }
    }
    .img-btn-content{
      width: 345px;
      display: flex;
      align-items: center;
      border-radius: 0 0 18px 18px;
      flex-shrink: 0;
      overflow: hidden;
      .img-btn{
        flex: 1;
        background-color: #ECF5FF;
        font-size: 16px;
        color: #000;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 19px 0;
        cursor: pointer;
        &.active{
          background-color: #409EFF;
          color: #fff;
        }
        opacity: 0.9;
        &:hover{
          opacity: 1;
        }
      }
    }
    .identity-emotion{
      width: 345px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      margin: 14px 0 56px 0;
      .emotion-title{
        width: 100%;
        text-align: center;
        margin-bottom: 15px;
      }
      .emotion-content{
        display: flex;
        align-items: center;
        .emotion-item {
          width: 44px;
          height: 44px;
          position: relative;
          margin: 3px;
          cursor: pointer;
          .emotion-item-icon{
            width: 100%;
            height: 100%;
          }
          .emotion-item-mark{
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #01010194;
            font-weight: bold;
            font-size: 16px;
            color: #409EFF;
            border-radius:50%;
          }
        }
      }
    }
  }
  .operation-btn{
    flex: 1;
    display: flex;
    flex-direction: column;
    .operation-btn-item{
      width: 176px;
      height: 120px;
      background: #ECF5FF;
      border-radius: 15px 15px 15px 15px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-bottom: 33px;
      cursor: pointer;
      flex-shrink: 0;
      &:hover{
        background-color: #409EFF;
        .operation-btn-item-icon, .operation-btn-item-name{
          color: #fff;
        }
      }
      .operation-btn-item-icon{
        // width: 40px;
        // height: 40px;
        font-size: 40px;
        margin-bottom: 16px;
        color: #000;
      }
      .operation-btn-item-name{
        font-size: 16px;
        color: #000000;
      }
    }
  }
}
</style>