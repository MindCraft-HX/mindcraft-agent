<template>
  <div class="identity" v-loading="loading && {text:loadingText}">
    <div class="identity-content">
      <div class="identity-img-content">
        <div class="identity-btn">
          <div class="pre-btn" title="上一张" :class="{'gray': nowAssestIndex <= 0}" @click.stop="preAssest">
            <svg class="pre-btn-icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-chexiao"></use>
            </svg>
          </div>
          <div class="next-btn" title="下一张" :class="{'gray': nowAssestIndex >= assestList.length - 1}" @click.stop="nextAssest">
            <svg class="pre-btn-icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-huifu"></use>
            </svg>
          </div>
          <div style="flex: 1;"></div>
          <div class="live2d-btn" :class="{'gray': !canCreateGif}" @click="confirmCreateMedia(1)" v-show="identityType == 0">
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-shengcheng2Ddonghua"></div>
            生成live2D动画
          </div>
        </div>
        <div class="identity-btn identity-btn-bottom">
          <div style="flex: 1;"></div>
          <el-button title="复制" circle icon="CopyDocument" type="primary" @click="copyAssest" :disabled="disabledCopy"></el-button>
          <el-button title="新建并粘贴" circle type="primary" @click="parseAssest" :disabled="disabledParse"><div style="font-size: 13px;" class="mindcraft-flow-win-iconfont icon-mindcraft-xinjianbingniantie"></div></el-button>
          <el-button title="粘贴并覆盖" circle type="primary" @click="coverAssest" :disabled="disabledParse"><div style="font-size: 13px;" class="mindcraft-flow-win-iconfont icon-mindcraft-niantiebingzhongzhi"></div></el-button>
          <el-button title="删除" circle icon="Delete" type="danger" @click="deleteAssest" :disabled="disabledDelete"></el-button>
        </div>
        <el-image class="identity-img" :src="assestLink ? assestLink : defaultImg" :preview-src-list="assestListPreview" :initial-index="nowAssestIndex" fit="cover" v-if="!identityType"/>
        <video class="identity-img" autoplay loop muted :src="assestLink" v-else></video>
      </div>
      <div class="img-btn-content">
        <div class="img-btn" :class="{'active': identityType === index}" @click="changeActiveIndex(index)" v-for="item, index in  ['静态立绘', '动态立绘']" :key="index">{{ item }}</div>
      </div>
      <div class="identity-emotion">
        <div class="emotion-title">设置情绪表情<el-button :type="haveUnSaveAssest ? 'danger' : 'info'" link style="margin-left: 6px;" plain @click="openAssestDrawer">{{ haveUnSaveAssest ? '*' : '' }}(查看全部)</el-button></div>
        <div class="emotion-content">
          <div class="emotion-item" @click="selectEmotion(index)" v-for="item, index in emotionList" :key="index">
            <svg class="emotion-item-icon" aria-hidden="true">
              <use :xlink:href="item.img"></use>
            </svg>
            <div class="emotion-item-mark" v-show="activeEmotion === index">{{ item.name }}</div>
          </div>
        </div>
      </div>
      <div class="btn-content">
        <el-button plain type="primary" @click="emit('changeSelectTab', 0)">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-shangyibu"></div>上一步</el-button>
        <el-button plain type="primary" @click="emit('changeSelectTab', 2)">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-xiayibu"></div>下一步</el-button>
        <el-button plain :type="characterUpdate || showTips ? 'danger' : 'primary'" @click="changeSave()">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-baocun"></div>
          {{character.character_id ? '更新' : '保存'}}
        </el-button>
        <el-button plain type="primary" @click="mitt.emit('changeSidebar', {tab: 0})">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-fanhui1"></div>返回</el-button>
        <br>
        <el-text type="danger" v-if="showTips">*有未保存的立绘请确认并保存</el-text>
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
    <el-drawer
      v-model="assestDrawer"
      title="全部资源"
      direction="rtl"
      size="50%"
    >
      <div class="assest-drawer-content">
        <el-collapse>
          <el-collapse-item class="assest-drawer-item" :class="{'un-save': item.assestChange || item.giftAssestChange || item.assest.length > 1 || item.giftAssest.length > 1}" :title="item.name" :name="item.name" v-for="item, index in emotionList" :key="index">
            <div style="display: flex;align-items: center;flex-wrap: wrap;">
              <div class="assest-drawer-item-content" v-if="item.assest.length">
                <el-text>
                  静态立绘
                  <el-text type="danger" v-if="item.assestChange">（*有未保存的立绘请确认并保存）</el-text>
                </el-text>
                <el-scrollbar max-width="100%" @wheel="handleWheel">
                  <div class="assest-drawer-item-content-list">
                    <div class="assest-drawer-item-content-item" v-for="item2, index2 in item.assest" :key="index2" @click="item.assestIndex = index2">
                      <el-image class="assest-drawer-item-content-item-img" :class="{'active': item.assestIndex == index2}" :src="item2" fit="cover"></el-image>
                    </div>
                  </div>
                </el-scrollbar>
              </div>
              <div class="assest-drawer-item-content" v-if="item?.giftAssest?.length">
                <el-text>动态立绘
                  <el-text type="danger" v-if="item.giftAssestChange">（*有未保存的立绘请确认并保存）</el-text>
                </el-text>
                <el-scrollbar max-width="100%" @wheel="handleWheel">
                  <div class="assest-drawer-item-content-list">
                    <div class="assest-drawer-item-content-item" v-for="item2, index2 in item.giftAssest" :key="index2" @click="item.giftAssestIndex = index2">
                      <video class="assest-drawer-item-content-item-img" :class="{'active': item.giftAssestIndex == index2}" autoplay loop muted :src="item2"></video>
                    </div>
                  </div>
                </el-scrollbar>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, inject, computed, watch, onMounted, h } from 'vue'
import { ElMessage, ElLoading, ElMessageBox, ElText, ElNotification, ElProgress } from 'element-plus'
import defaultImg from '@/assets/characterSquare/characterSquareBG.png'
const character = inject("character")
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();

const props = defineProps(["selectTab", "characterUpdate"])
const emit = defineEmits(["changeSelectTab", "saveCharacter"])

// 立绘类型
const identityType = ref(0) // 0: 静态立绘 1: 动态立绘
const changeActiveIndex = (index) => {
  identityType.value = index
  // nowAssestIndex.value = assestList.value.length - 1
}

const getHistoryList = async () => {
  console.log('getHistoryList', character.value)
  emotionList.value = emotionList.value.map(emotion => {
    Object.keys(character.value?.assets || {})?.map(key => {
      if(key.includes(emotion.key)) {
        if(key.includes('_gif')) {
          emotion.giftAssest = [character.value?.assets?.[key]]
        } else {
          emotion.assest = [character.value?.assets?.[key]]
        }
      }
    })
    return emotion
  })
  nowAssestIndex.value = assestList.value.length - 1
  showTips.value = false
  // try {
  //   console.log('getHistoryList', character.value)
  //   const res = await window.electronAPI.getCharacterMediaListByfilePath()
  //   emotionList.value = emotionList.value.map(emotion => {
  //     res.map(item => {
  //       // console.log(item, Object.keys(item),emotion.key)
  //       const info = Object.keys(item)?.find(name => name.includes(emotion.key))
  //       if(info) {
  //         if(info.includes('_gif')) {
  //           emotion.giftAssest = item[info]
  //         } else {
  //           emotion.assest = item[info]
  //         }
  //       }
  //     })
  //     return emotion
  //   })
  //   nowAssestIndex.value = assestList.value.length - 1
  // } catch (error) {
  //   console.log(error)
  //   ElMessage.error('读取立绘资源异常')
  // }
}
onMounted(() => {
  getHistoryList()
})
defineExpose({ getHistoryList })
// watch(() => props.selectTab, (val) => {
//   if(val === 1) {
//     getHistoryList()
//   }
// })

const emotionInfo = computed(() => {
  return emotionList.value?.[activeEmotion.value] || {}
})

// 当前资源历史列表
const assestList = computed(() => {
  return emotionInfo.value?.[identityType.value ? 'giftAssest' : 'assest'] || []
})
const assestListPreview = computed(() => {
  return assestList.value.map(item => item)
})
// 静态立绘资源历史列表索引
const assestIndex = computed({
  get() {
    return emotionInfo.value?.assestIndex || 0
  },
  set(val) {
    emotionList.value[activeEmotion.value].assestIndex = val
  }
})
// 动态立绘资源历史列表索引
const assestGifIndex = computed({
  get() {
    return emotionInfo.value?.giftAssestIndex || 0
  },
  set(val) {
    emotionList.value[activeEmotion.value].giftAssestIndex = val
  }
})
// 当前资源历史列表索引
const nowAssestIndex = computed({
  get() {
    return identityType.value ? assestGifIndex.value : assestIndex.value
  },
  set(val) {
    if(identityType.value) {
      assestGifIndex.value = Math.max(0, Math.min(Math.max(0, val), assestList.value.length - 1))
    } else {
      assestIndex.value = Math.max(0, Math.min(Math.max(0, val), assestList.value.length - 1))
    }
  }
})
const preAssest = () => {
  nowAssestIndex.value --
}
const nextAssest = () => {
  nowAssestIndex.value ++
}
// 当前资源地址
const assestLink = computed(() => {
  return assestList.value?.[nowAssestIndex.value] || ''
})

const emotionList = ref([
  { name: "中性", key: 'neutral', img: "#icon-mindcraft-zhongxing", assestIndex: 0, assestChange: false, assest: [], giftAssestIndex: 0, giftAssestChange: false, giftAssest: [] },
  { name: "高兴", key: 'happy', img: "#icon-mindcraft-gaoxing", assestIndex: 0, assestChange: false, assest: [], giftAssestIndex: 0, giftAssestChange: false, giftAssest: []},
  { name: "悲伤", key: 'sad', img: "#icon-mindcraft-beishang", assestIndex: 0, assestChange: false, assest: [], giftAssestIndex: 0, giftAssestChange: false, giftAssest: []},
  { name: "害怕", key: 'fearful', img: "#icon-mindcraft-haipa", assestIndex: 0, assestChange: false, assest: [], giftAssestIndex: 0, giftAssestChange: false, giftAssest: []},
  { name: "惊讶", key: 'surprised', img: "#icon-mindcraft-jingya", assestIndex: 0, assestChange: false, assest: [], giftAssestIndex: 0, giftAssestChange: false, giftAssest: []},
  { name: "厌恶", key: 'disgusted', img: "#icon-mindcraft-yane", assestIndex: 0, assestChange: false, assest: [], giftAssestIndex: 0, giftAssestChange: false, giftAssest: []},
  { name: "愤怒", key: 'angry', img: "#icon-mindcraft-fennu", assestIndex: 0, assestChange: false, assest: [], giftAssestIndex: 0, giftAssestChange: false, giftAssest: []},
])
const activeEmotion = ref(0)
const selectEmotion = (index) => {
  activeEmotion.value = index == activeEmotion.value ? 0 : index
  // nowAssestIndex.value = assestList.value.length - 1
}
const haveUnSaveAssest = computed(() => {
  return emotionList.value.some(emotion => emotion.assestChange || emotion.giftAssestChange || emotion.assest.length > 1 || emotion.giftAssest.length > 1)
})

const changeSave = async () => {
  // console.log(assestList.value?.[nowAssestIndex.value])
  // apiCreateCharacterMedia({
  //   media_file_url: assestLink.value,
  //   media_type: "IMAGE",
  //   media_key: mediaKey.value
  // }, character.value.character_id)
  // .then(res => {
  //   console.log(res)
  //   addAssestData(res?.data?.data || {}, 1)
  //   emit('saveCharacter', 1)
  //   showTips.value = false
  // })
  // .catch(err => {
  //   ElMessage.error(err?.response?.data?.message || '保存失败') 
  // })
  loading.value = true
  loadingText.value = '正在保存...'
  const progressPercent = ref(0)
  const notice = ElNotification({
    title: `更新角色${character.value.name}立绘`,
    duration: 0,
    message: () => 
      progressPercent.value >= 100 ? 
      h(ElText, {type: 'success'}, '更新角色立绘完成')
      : 
      [
        h(ElText, null, '更新角色立绘中，请勿离开编辑界面'),
        h(ElProgress, {
          percentage: progressPercent.value.toFixed(2),
          striped: true,
          stripedFlow: true,
        })
      ]
  })
  let media_data = {}
  try {
    emotionList.value.map(emotion => {
      if(emotion?.assest?.[emotion?.assestIndex]) {
        media_data[emotion.key] = emotion.assest[emotion.assestIndex] || ""
      }
      if(emotion?.giftAssest?.[emotion?.giftAssestIndex]) {
        media_data[emotion.key + '_gif'] = emotion.giftAssest[emotion.giftAssestIndex] || ""
      }
    })
    // console.log(media_data)
    // return
    await api.post(`/v1/character/${character.value.character_id}/media_update_data/`, {
      media_data,
      noLoading: 1
    }, {
      responseType: "stream",
      onDownloadProgress: (progressEvent) => {
        const chunk = progressEvent.event.currentTarget.response
        const data = chunk.split(/\n\n/g).map(i => i.split("data:")[1]).filter(i => i)
        // console.log(data)
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
          return item
        })
      }
    });
  } catch (error) {
    console.error(error)
    ElMessage.error((JSON.parse(error?.response?.data || "{}"))?.message || '更新失败')
  } finally {
    loading.value = false
    loadingText.value = '请稍后...'
    console.log(media_data)
    Object.entries(media_data).map(item => {
      addAssestData({media_key: item[0], media_url: item[1]}, 1)
    })
    setTimeout(() => {
      notice?.close()
    }, 1000);
    emit('saveCharacter', 0)
  }
}

const uploadImg = ref(null)
const uploadVideo = ref(null)
const operationList = computed(() => {
  const options = [
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
      name: mediaKey.value.includes("neutral") ? "AI生成形象" : "AI生成表情",
      img: mediaKey.value.includes("neutral") ? "icon-mindcraft-AIshengchengxingxiang" : "icon-mindcraft-AIshengchengbiaoqing",
      fn: () => {
        confirmCreateMedia(0)
      }
    },
    {
      name: "AI图片编辑",
      img: "icon-mindcraft-AItupianbianji",
      fn: () => {
        confirmEditImage()
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
  return options
})

// 是否可以创建gif
const canCreateGif = computed(() => {
  if(identityType.value == 0) {
    return !!assestLink.value
  } else {
    return emotionInfo.value?.assest?.length
  }
})

import { apiCreateCharacterPrompt } from "@/api/application/character.js";
const confirmCreateMedia = async (type) => {
  if(type == 1 && !canCreateGif.value) {
    return ElMessage.error('请生成静态立绘')
  }
  if(type == 0 && !mediaKey.value.includes("neutral") && !assestLink.value) {
    ElMessageBox.alert('请先上传底图或者从中性表情中复制底图', '当前无底图！', {
      confirmButtonText: '确认',
    })
    return
  }

  /************* 获取提示词 ************/
  try {
    const res = await apiCreateCharacterPrompt({
      media_key: type == 0 ? emotionInfo.value?.key : emotionInfo.value?.key + "_gif",
      image_url: type == 0 && mediaKey.value == "neutral" ? '' : assestLink.value,
    }, character.value.character_id)
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
  let imageLink = ''
  let prompt = ""
  if(type) {
    prompt = character.value?.appearanceDescription?.[emotionInfo.value?.key + "_gif"] || ""
  } else {
    prompt = character.value?.appearanceDescription?.[emotionInfo.value?.key] || ""
  }
  await ElMessageBox.prompt(`${type == 0 ? '图片' : 'live2D动画'}提示词`, '请确认并修改提示词', {
      inputValue: prompt,
      inputType: 'textarea',
      customClass: 'character-square-identity-prompt-box',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      draggable: true,
    })
    .then(({ value }) => {
      if(type == 0 && mediaKey.value != "neutral") {
        imageLink = emotionInfo.value?.assest?.[nowAssestIndex.value] || ''
      }
      prompt = value

      /************* 确认消耗 ************/
      // 20250408这里积分和时间应老板要求写死豆包时间积分，规则是图生图240，文生图200
      const time = type ? 180 : 120
      const price = type ? 3000 : mediaKey.value != "neutral" ? 240 : 200
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
        createMediaAuto(prompt, imageLink)
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

import { apiCharacterImg2Img } from "@/api/application/character.js";
const confirmEditImage = async () => {
  if(!mediaKey.value.includes("neutral") && !assestLink.value) {
    ElMessageBox.alert('请先上传底图或者从中性表情中复制底图', '当前无底图！', {
      confirmButtonText: '确认',
    })
    return
  }
  ElMessageBox.prompt(`图片提示词`, '请输入你的修改要求', {
    inputType: 'textarea',
    customClass: 'character-square-identity-prompt-box',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    draggable: true,
  })
  .then(({ value }) => {
    console.log(value)
    identityType.value = 0
    const params = {
      image_urls: [assestLink.value],
      prompt: value,
      return_url: true
    } 
    
    ElMessageBox({
      title: `即将根据角色设定生成图片`,
      message: () =>
      [
        h(ElText, {type: 'info'}, `预计生成时间120秒，预计消耗240积分`),
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
      loading.value = true
      loadingText.value = '开始生成创建任务...'
      setTimeout(() => {
        loadingText.value = '正在生成中...（请耐心等待）'
      }, 1000)
      apiCharacterImg2Img({
        ...params,
        noLoading: 1
      })
      .then(res => {
        console.log(res)
        const url = res?.data?.data?.image_urls?.[0] || ''
        if(url) {
          addAssestData({
            media_key: mediaKey.value,
            media_url: url
          })
        }
      })
      .catch(err => {
        ElMessage.error( err?.response?.data || '生成失败')
      })
      .finally(() => {
        loading.value = false
        loadingText.value = '请稍后...'
      })
    })
  })
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
  if(!identityType.value) return emotionList.value?.[activeEmotion.value]?.key || ''
  else return (emotionList.value?.[activeEmotion.value]?.key || '') + '_gif'
})
import { apiCreateCharacterMedia } from "@/api/application/character.js";
const createMedia = async (file) => {
  const formData = new FormData()
  formData.append("media_type", "IMAGE")
  formData.append("media_key", mediaKey.value)
  if(file) {
    formData.append("media_file", file.blob, file.name);
  }
  apiCreateCharacterMedia(formData, character.value.character_id)
  .then(res => {
    console.log(res)
    addAssestData(res?.data?.data || {}, 1)
  })
}
import api from "@/utils/request";
const showTips = computed({
  get() {
    if(assestList.value.length > 1) return true
    return emotionInfo.value?.[identityType.value ? 'giftAssestChange' : 'assestChange']
  },
  set(val) {
    emotionList.value[activeEmotion.value][identityType.value ? 'giftAssestChange' : 'assestChange'] = val
  }
})
const loadingText = ref('请稍后...')
let loadingTimer = null
const loading = ref(false)
const createMediaAuto = async (prompt, imageLink) => {
  console.log(prompt, imageLink)
  showTips.value = false
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
    await api.post(`/v1/character/${character.value.character_id}/media_create/`, {
      media_key: mediaKey.value, 
      image_model: window.VITE_NODE_ENV == 'development' ? "cogview-3-flash" : "",
      video_model: window.VITE_NODE_ENV == 'development' ? "cogvideox-flash" : "",
      appearanceDescription: prompt || "",
      image_url: imageLink || "",
      noLoading: 1
    }, {
      responseType: "stream",
      onDownloadProgress: (progressEvent) => {
        const chunk = progressEvent.event.currentTarget.response
        const data = chunk.split(/\n\n/g).map(i => i.split("data:")[1]).filter(i => i)
        // console.log(data)
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
            addAssestData(info)
          }
          return item
        })
      }
    });
  } catch (error) {
    ElMessage.error((JSON.parse(error?.response?.data || "{}"))?.message || '生成失败')
  } finally {
    showTips.value = true
    loading.value = false
    clearInterval(loadingTimer)
    loadingTimer = null
    loadingText.value = '请稍后...'
  }
}

const addAssestData = async (info, update) => {
  const index = emotionList.value.findIndex(item => info.media_key.includes(item.key))
  if(index > -1) {
    // const res = await window.electronAPI.addCharacterMediaByDownLoadLink(
    //   {
    //     fileUrl: info.media_url,
    //     type: info.media_key,
    //     time: info.timestamp,
    //   }
    // );
    if(info.media_key.includes('_gif')) {
      if(update) {
        emotionList.value[index].giftAssest = []
        emotionList.value[index].giftAssestChange = false
      }
      emotionList.value[index].giftAssest.push(info.media_url)
      nowAssestIndex.value = emotionList.value[index].giftAssest.length - 1
    } else {
      if(update) {
        emotionList.value[index].assest = []
        emotionList.value[index].assestChange = false
      }
      emotionList.value[index].assest.push(info.media_url)
      nowAssestIndex.value = emotionList.value[index].assest.length - 1
    }
  }
  // console.log(emotionList.value)
}

const assestDrawer = ref(false)
const openAssestDrawer = () => {
  assestDrawer.value = true
}

const handleWheel = (event) => {
  const scrollContainer = event.currentTarget.querySelector(".el-scrollbar__wrap");
  if (!scrollContainer) return;
  
  // 检测是否有水平滚动条
  const hasHorizontalScroll = scrollContainer.scrollWidth > scrollContainer.clientWidth;
  
  if (hasHorizontalScroll) {
    const scrollAmount = event.deltaY * 2;
    scrollContainer?.scrollTo({
      left: scrollContainer.scrollLeft + scrollAmount,
      behavior: "smooth",
    });
    event.preventDefault();
  }
};

/*********** 图片操作 **********/
const copyData = ref({})
const disabledCopy = computed(() => {
  return !assestLink.value
})
const copyAssest = () => {
  if(disabledCopy.value) {
    return
  }
  copyData.value = {
    assest: assestLink.value,
    type: mediaKey.value,
    isVideo: mediaKey.value.includes('_gif')
  }
  ElMessage.success('复制成功，选择对应的情绪类型粘贴吧')
  console.log(copyData.value)
}
const disabledParse = computed(() => {
  if(!copyData.value.assest) return true
  if(copyData.value.assest == assestLink.value) return true
  if(assestList.value.some(item => item == copyData.value.assest)) return true
  return !!identityType.value != copyData.value.isVideo
})
const parseAssest = () => {
  if(disabledParse.value) {
    return 
  }
  emotionList.value[activeEmotion.value][identityType.value ? 'giftAssest' : 'assest'].push(copyData.value.assest)
  nowAssestIndex.value = assestList.value.length - 1
  showTips.value = true
  ElMessage.success('粘贴成功')
}
const coverAssest = () => {
  if(disabledParse.value) {
    return 
  }
  emotionList.value[activeEmotion.value][identityType.value ? 'giftAssest' : 'assest'][nowAssestIndex.value] = copyData.value.assest
  showTips.value = true
  ElMessage.success('替换成功')
}
const disabledDelete = computed(() => {
  if(assestList.value.length <= 1) return true
  return !assestLink.value
})
const deleteAssest = () => {
  if(disabledDelete.value) {
    return
  }
  emotionList.value[activeEmotion.value][identityType.value ? 'giftAssest' : 'assest'].splice(nowAssestIndex.value, 1)
  nowAssestIndex.value = Math.max(0, nowAssestIndex.value - 1)
  showTips.value = true
  ElMessage.success('删除成功')
}
/*********** 图片操作 **********/
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.identity{
  display: flex;
  // justify-content: space-between;
  padding: 29px 47px;
  width: 100%;
  // height: 100%;
  .identity-content{
    height: 100%;
    display: flex;
    flex-direction: column;
    // flex: .5;
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
        &-bottom {
          bottom: 11px;
          top: initial;
        }
        .pre-btn,.next-btn{
          width: 33px;
          height: 33px;
          margin: 0 3px;
          opacity: 0.8;
          cursor: pointer;
          &:hover{
            opacity: 1;
          }
          .pre-btn-icon {
            width: 100%;
            height: 100%;
          }
        }
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
      overflow: hidden;
      flex-shrink: 0;
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
        display: flex;
        align-items: center;
        justify-content: center;
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
      min-height: 120px;
      background: #ECF5FF;
      border-radius: 15px 15px 15px 15px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-bottom: 33px;
      cursor: pointer;
      flex-shrink: 0;
      padding: 12px;
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
.assest-drawer-content{
  width: 100%;
  display: flex;
  flex-direction: column;
  text-align: left;
  .el-text{
    width: 100%;
    padding: 12px 0;
  }
  .assest-drawer-item{
    width: 100%;
    display: flex;
    flex-direction: column;
    &.un-save {
      :deep(.el-collapse-item__header) {
        --el-collapse-header-text-color: #ff4040;
        &::before {
          content: "*";
          color: #ff4040;
          margin-left: 4px;
        }
      }
    }
    :deep(.is-active) {
      --el-collapse-header-text-color: #409EFF;
    }
    .assest-drawer-item-content{
      width: 100%;
      display: flex;
      flex-direction: column;
      padding: 6px;
      .assest-drawer-item-content-list{
        display: flex;
        align-items: center;
      }
      .assest-drawer-item-content-item{
        box-sizing: content-box;
        display: flex;
        align-items: center;
        width: 172px;
        height: 214px;
        cursor: pointer;
        margin-right: 6px;
        padding-bottom: 12px;
        flex-shrink: 0;
        overflow: auto;
        padding: 5px;
        .assest-drawer-item-content-item-img{
          &.active{
            outline: 3px solid #409EFF;
            box-shadow: 2px 2px 2px 2px #000000;
          }
          width: 100%;
          height: 100%;
          object-fit: cover;
          background-image: url("@/assets/characterSquare/characterSquareBG.png");
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center center;
          user-select: none;
          border-radius: 18px;
          flex-shrink: 0;
        }
      }
    }
  }
}
</style>