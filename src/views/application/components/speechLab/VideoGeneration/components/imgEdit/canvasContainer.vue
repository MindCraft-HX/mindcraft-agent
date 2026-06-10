<!-- 图片编辑器 -->
<template>
  <div class="container">
    <div class="source-info">
      <div class="source-name" v-if="curSourceInfo.fileName">名称：{{ curSourceInfo.fileName }}</div>
      <div class="source-model" v-if="curSourceInfo.model">模型：{{ curSourceInfo.model || "未知" }}</div>
    </div>
    <div class="image-canvas-box"
      :class="loading && curEditorTool === '' && (isTextToImg || isMulImgToImg) ? 'text-to-img' : 'img-to-img'">
      <div v-if="loading && curEditorTool === '' && (isTextToImg || isMulImgToImg)" class='text-loading'>
        <!-- 正在文生图 -->
        <img src="@/assets/videoGeneration/img.png" />
        <el-progress style="width: 162px" :stroke-width="6" :percentage="50" :indeterminate="true" :text-inside="true"
          v-if="loading" />
        <div style="color: #fff; font-size: 12px; text-align: center; margin-top: 10px; font-weight: 600" >{{isTextToImg?'文':'图'}}生图中，请勿退出软件
        </div>
      </div>
      <!-- 只透明化处理，使用v-else会销毁canvas，导致画笔无法绘制 -->
      <div class="image-canvas" ref="imageCanvasRef" :style="{ opacity: hideImageCanvas ? 0 : 1 }">
        <img class="image" ref="imgRef" v-if="imgSrc" :src="imgSrc" @load="loadImg">
        <!-- <canvas class="image-editor-canvas" style="width: 500px;height:500px;" ref="canvasRef" id="drawCanvas">
        </canvas> -->
      </div>
    </div>
  </div>
</template>
<script setup>
import { nextTick, onMounted, computed, ref, watch, onUnmounted } from 'vue'
import { useFileType } from '../../hook/useFileType'
import { apiImgToImgMask, apiImgToImgHD, apiImgToImg } from '@/api/application/imgEdit.js'
import { fabric } from "fabric-with-erasing"
import { getImageType, generateMask, base64ToFabricPaths, getBase64FromImage, createMaskedImage } from '@/utils/base64'
import { ElMessage } from "element-plus";
import { Conf } from "electron-conf/renderer";
import { useImgEditStore } from '@/stores/imgEdit.js'
import { storeToRefs } from 'pinia';
import { useMitt } from "@/utils/mitt.js";
import { v4 as uuidv4 } from 'uuid';
const mitt = useMitt();
const imgEditStore = useImgEditStore()
const { showEditorTool, curDrawTool, curEditorTool, curDrawSize, disabledDrawTool, hasPaint, loadingMaxStep,
  repaintData, isDirtyEdit, imgToImgData, onCutImgFlag, onSaveImgFlag, onEraseImgFlag, onRepaintImgFlag,
  onHdImgFlag, onImgToImgFlag, onReGenerateImgFlag, mediaPath, newAddTimes } = storeToRefs(imgEditStore)
const { isImage } = useFileType()
const props = defineProps(["loading", "sourceList"])
const emit = defineEmits(['update:loading'])
const canvasRef = ref(null) // 画布DOM
const imageCanvasRef = ref(null)  // 整个容器DOM
let canvas = ref(null)  // 画布实例
let imgSrc = ref('')
let imgRef = ref(null)
const patternBrushSize = ref(10) //  画笔格子大小
const patternBrush = ref(null) //  画笔
const canvasWidth = ref(500) //  画布宽度
const canvasHeight = ref(500) //  画布高度
const quickCheckList = ref([]) // 快速选中图片list
const tempSaveDrawTool = ref('') // 临时存储画图工具
const tempSourceInfo = ref({ // 图片信息
  model: '',
  image: ''
})
const pattern = ref()

onMounted(() => {
  canvas.value = new fabric.Canvas('drawCanvas')
  canvas.value.hoverCursor = 'pointer';
  window.addEventListener('resize', function () {
    nextTick(() => {
      // 窗口变化，重新计算图片
      if (imgRef.value) {
        updateImageSizeAndPosition()
      }
    })
  });
  // // 监听画布变化
  canvas.value.on('object:added', () => {
    hasPaint.value = hasPaintedColor();
  });
  canvas.value.on('object:modified', () => {
    hasPaint.value = hasPaintedColor();
  });
  // 监听路径创建事件
  canvas.value.on('path:created', (e) => {
    const path = e.path
    // 锁定路径，不允许移动
    path.lockMovementX = true
    path.lockMovementY = true
    path.selectable = false
    canvas.value.renderAll()
  })
})
onUnmounted(() => {
  window.removeEventListener('resize', () => { })
})

/********************************************************图片处理*******************************************************/
watch(() => mediaPath.value, () => {
  //初始化
  imgEditStore.$patch({
    curEditorTool: '',
    curDrawTool: '',
    showEditorTool: false, //  展示编辑工具
    showDrawTool: false,
    hasPaint: false,
    isDirtyEdit: false,
    disabledDrawTool: false
  })
  quickCheckList.value = []
  patternBrush.value = null
  if (canvas.value) {
    setCanvasOpacity(1)
    canvas.value.clear()
  }
  if (!mediaPath.value || !isImage(mediaPath.value)) {
    imgSrc.value = ''
    return
  }
  imgSrc.value = `file://${mediaPath.value}`
  showEditorTool.value = true //  有图片则展示编辑工具
}, { deep: true, immediate: true })

const loadImg = () => {
  updateImageSizeAndPosition()
}
/**
 * 图片初始化或窗口大小发生变化时，重新调整图片的（宽高、比例、left、top）、canvas的（宽高、比例、left、top）、笔刷大小
*/
function updateImageSizeAndPosition() {
  //   重新计算
  const contanier = imageCanvasRef.value // 获取容器
  let img = imgRef.value// 获取图片
  const canvasEl = canvas.value.wrapperEl // 获取canvas元素
  // 计算缩放比例
  const contanierWidth = contanier.clientWidth;
  const contanierHeight = contanier.clientHeight;
  const imgWidth = img.naturalWidth; // 图片原始宽度
  const imgHeight = img.naturalHeight; // 图片原始高度
  const oldCanvasWidth = canvasEl.clientWidth // canvas原始宽度
  const oldCanvasHeight = canvasEl.clientHeight // canvas原始高度
  // 计算缩放比例
  const widthRatio = contanierWidth / imgWidth;
  const heightRatio = contanierHeight / imgHeight;
  const scale = Math.min(widthRatio, heightRatio); // 取较小的比例，确保图片完全显示
  // 调整canvas宽高
  canvasWidth.value = imgWidth * scale;
  canvasHeight.value = imgHeight * scale;
  // 计算居中位置
  const left = (contanierWidth - canvasWidth.value) / 2;
  const top = (contanierHeight - canvasHeight.value) / 2;
  img.style.top = top + 'px';
  img.style.left = left + 'px';
  img.style.width = canvasWidth.value + 'px';
  img.style.height = canvasHeight.value + 'px';
  const scaleX = canvasWidth.value / oldCanvasWidth
  const scaleY = canvasHeight.value / oldCanvasHeight
  canvasEl.style.opacity = 0.5
  canvasEl.style.width = canvasWidth.value + 'px';
  canvasEl.style.height = canvasHeight.value + 'px';
  canvasEl.style.left = left + 'px';
  canvasEl.style.top = top + 'px';
  //  调整每一个元素的比例
  canvas.value.getObjects().forEach(function (obj) {
    if (obj.type === 'path') {
      obj.left = obj.left * scaleX
      obj.top = obj.top * scaleY
      obj.scaleX = obj.scaleX * scaleX
      obj.scaleY = obj.scaleY * scaleY
      obj.setCoords()
    }
  });
  //  更新笔画格子大小
  if (patternBrush.value) {
    patternBrushSize.value = patternBrushSize.value * scaleX
    patternBrush.value.source = generatePatternSource(patternBrushSize.value)
    canvas.value.freeDrawingBrush = patternBrush.value
  }
  //  更新画布大小
  canvas.value.setDimensions({
    width: canvasWidth.value,
    height: canvasHeight.value,
  });
  canvas.value.renderAll();
}

//  图片信息
const curSourceInfo = computed(() => {
  const fileName = window.electronAPI.pathBasename(mediaPath.value)
  const info = props.sourceList.find(item => item.fileName == fileName)
  return {
    ...info,
    fileName
  }
})
/********************************************************canvas处理*********************************************************************/
/**
 * 设置canvas的透明度
 * **/
const setCanvasOpacity = (opacity) => {
  //  设置canvas的透明度
  canvas.value.upperCanvasEl.style.opacity = opacity
  canvas.value.lowerCanvasEl.style.opacity = opacity
}
/**
 * 生成格子笔刷
 * **/
const generatePatternSource = (size) => {
  const canvas = fabric.document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.height = size * 2;
  // 蓝白格子
  ctx.fillStyle = '#4a8ecd';
  ctx.fillRect(0, 0, size, size);
  ctx.fillRect(size, size, size, size);

  ctx.fillStyle = '#66abe9';
  ctx.fillRect(size, 0, size, size);
  ctx.fillRect(0, size, size, size);
  return canvas;
}
// 创建可复用的图案对象
const createPattern = (size = 10) => {
  return new fabric.Pattern({
    source: generatePatternSource(size),
    repeat: 'repeat',        // 确保无缝平铺
    offsetX: 0,              // 对齐起始位置
    offsetY: 0
  });
};
/**
 * 生成原图的base64和canvas画布涂鸦的base64
 * **/
const handleGenerateImgBase64 = async () => {
  let sourceBase64 = await getBase64FromImage(imgRef.value)
  let maskBase64 = await generateMask(canvas.value.lowerCanvasEl, imgRef.value.naturalWidth, imgRef.value.naturalHeight, 'base64')
  return [sourceBase64, maskBase64]
}

/**
 * 鼠标移入path事件
 * **/
const handlePathMouseOver = (path) => {
  if (curDrawTool.value !== 'select') return
  if (path.isCheck) {
    path.set({
      stroke: '#fff',   // 高亮颜色
      strokeWidth: 1,       // 边框宽度
    });
  } else {
    path.set({
      stroke: '#fff',   // 高亮颜色
      strokeWidth: 2,       // 边框宽度
      fill: 'rgba(255,255,255,0.5)',
      shadow: new fabric.Shadow({
        color: '#fff',      // 发光颜色（与线条同色）
        blur: 4,              // 模糊半径（控制光晕大小）
        offsetX: 0,            // 水平偏移
        offsetY: 0,            // 垂直偏移
        affectStroke: true     // 让阴影作用于描边
      })
    });
  }


  canvas.value.requestRenderAll();
}
/**
 * 鼠标移出path事件
 * **/
const handlePathMouseOut = (path) => {
  if (curDrawTool.value !== 'select') return
  if (!path.isCheck) {
    path.set({
      stroke: 'transparent',
      strokeWidth: 0,
      fill: 'rgba(0,0,0,0.01)'
    });
  } else {
    path.set({
      stroke: 'transparent',
      strokeWidth: 0,
    });
  }
  canvas.value.requestRenderAll();
}
/**
 * 鼠标点击path事件
 * **/
const handlePathMouseDown = (path) => {
  if (curDrawTool.value !== 'select') return
  if (!path.isCheck) {
    // 选中，填充格子图案
    path.set({
      stroke: 'transparent',
      strokeWidth: 0,
      fill: pattern.value,
    });
    path.dirty = true
    if (path.eraser) {
      delete path.eraser
    }
    path.isCheck = true
  } else {
    //  取消选中
    path.set({
      stroke: 'transparent',
      strokeWidth: 0,
      fill: 'rgba(0,0,0,0.01)',
    });
    path.dirty = true
    path.isCheck = false
  }
  // 手动触发 object:modified 事件
  canvas.value.fire('object:modified', { target: path });
  canvas.value.requestRenderAll();
}


const handleAddMark = () => {
  const file = event.target.files[0];
  if (!file) return;

  // 方式1：生成 Base64
  const reader = new FileReader();
  reader.onload = async (e) => {
    let imageSrc = e.target.result;
    let path = await handleGenerateBase64ToPath(imageSrc)
    quickCheckList.value.push(path)
    canvas.value.add(path)
    canvas.value.requestRenderAll();
  };
  reader.readAsDataURL(file);
}
/**
 * 把黑白色的图片（base64），经过算法算出轮廓，再轮廓数据转成fabric可编辑的Path，并设置Path的事件
 * **/
const handleGenerateBase64ToPath = (maskBase64) => {
  return new Promise((resolve, reject) => {
    base64ToFabricPaths(maskBase64, (paths, width, height) => {
      // 计算缩放比例
      const maskScaleX = canvasWidth.value / width
      const maskScaleY = canvasHeight.value / height
      pattern.value = createPattern(Math.floor(patternBrushSize.value / maskScaleX));
      const comPath = []
      paths[0].forEach((points, i) => {
        if (i !== 0) {
          comPath.push(points.map(([x, y], index) => {
            return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
          }))
          comPath.push('Z')
        }
      })
      let fabricPath = new fabric.Path(comPath.join(' '), {
        fill: 'rgba(0,0,0,0.01)',             // 填充颜色（可以是任意颜色）
        // fill: color[i],
        fillRule: "evenodd", // 关键配置
        scaleX: maskScaleX,
        scaleY: maskScaleY,
        perPixelTargetFind: true, // 关键配置：启用像素级检测
        selectable: false,
        evented: true,        // 必须启用事件
        isCheck: false, // 是否已设置选中为蒙版
        customPath: true,
        erasable: false,                      // 禁止被橡皮擦擦除
        symbol: uuidv4(), // 唯一标识符
        copyCount: 0 // 复制次数
      });
      fabricPath.set({
        left: fabricPath.left * maskScaleX,
        top: fabricPath.top * maskScaleX,
      });

      fabricPath.on('mouseover', (e) => {
        handlePathMouseOver(fabricPath)
      });
      fabricPath.on('mouseout', (e) => {
        handlePathMouseOut(fabricPath)
      });
      fabricPath.on('mousedown', (e) => {
        handlePathMouseDown(fabricPath)
      }
      )
      resolve(fabricPath)
    });
  })
}

/**
 * 检查画布上是否有涂鸦
 * */
const hasPaintedColor = () => {
  const objects = canvas.value.getObjects();
  for (const obj of objects) {
    if (obj.type === 'path') {
      if (obj.fill && obj.fill.source) {
        return true
      }
      if (obj.stroke && obj.stroke.source) {
        return true
      }
    }
  }
  return false
}
/**
 * 设置画布可绘制，设置格子笔刷
 * **/
const handleDrawLine = () => {
  try {
    canvas.value.isDrawingMode = true;
    patternBrush.value = new fabric.PatternBrush(canvas.value);
    patternBrush.value.source = generatePatternSource(patternBrushSize.value);
    canvas.value.freeDrawingBrush = patternBrush.value
    canvas.value.freeDrawingBrush.width = curDrawSize.value; // 设置笔的宽度
    canvas.value.renderAll();
  } catch (error) {
    console.log(error)
  }
}
/**
 * 设置画布为擦除模式
 * **/
const handleEraseLine = () => {
  canvas.value.isDrawingMode = true;
  canvas.value.freeDrawingBrush = new fabric.EraserBrush(canvas.value);
  canvas.value.freeDrawingBrush.globalCompositeOperation = 'destination-out'; // 使用 destination-out 模式
  canvas.value.freeDrawingBrush.width = curDrawSize.value; // 设置擦除笔的宽度
  canvas.value.renderAll();
}
/**
 * 根据请求得到的图片，转成画布轮廓，可进行选中
 * **/
const handleSelectLine = async () => {
  //  快速选中
  canvas.value.isDrawingMode = false;
  if (quickCheckList.value.length == 0) {
    let base64Img = await getBase64FromImage(imgRef.value)
    const base64Data = base64Img.replace(/^data:image\/(\w+);base64,/, "")
    const params = {
      model: 'zj_entity_seg',
      model_quality: 'H',
      image_base64: [base64Data],
      max_entity: 20,
      return_format: 3,
      refine_mask: 0
    }
    try {
      emit('update:loading', true)
      loadingMaxStep.value = 0.5
      let res = await apiImgToImgMask(params)
      const maskList = res.data.data.binary_data_base64
      //  去掉第一张原图
      maskList.splice(0, 1)
      const pathList = await Promise.all(maskList.map(async (maskBase64, i) => {
        //  把base64图片转成涂鸦
        const res = await handleGenerateBase64ToPath(`data:image/png;base64,` + maskBase64)
        return res
      }))
      quickCheckList.value = pathList
      canvas.value.add(...quickCheckList.value)
      canvas.value.requestRenderAll();
      emit('update:loading', false)
    } catch (error) {
      emit('update:loading', false)
      if (error?.response?.data?.message) {
        ElMessage.error(error.response.data.message);
      }
    }
  } else {
    const objects = canvas.value.getObjects()
    for (let path of objects) {
      if (path.customPath) {
        //  防止生成多个副本path
        let len = objects.filter(obj => obj.symbol === path.symbol)
        if (len.length >= 2) continue;
        path.clone(clonedPath => {
          clonedPath.set({
            selectable: false,
            erasable: true,
            evented: true,
            name: 'cloned-path',
            isCheck: false,
            customPath: true,
            fill: 'rgba(0,0,0,0.01)',             // 填充颜色（可以是任意颜色）
            fillRule: "evenodd", // 关键配置
            perPixelTargetFind: true, // 启用像素级检测
            symbol: path.symbol,
            isUnique: false,
            copyCount: path.copyCount + 1 // 每次复制次数加1
          });
          delete clonedPath.eraser;
          clonedPath.on('mouseover', (e) => {
            handlePathMouseOver(clonedPath)
          });
          clonedPath.on('mouseout', (e) => {
            handlePathMouseOut(clonedPath)
          });
          clonedPath.on('mousedown', (e) => {
            const objects = canvas.value.getObjects()
            if (!clonedPath.isCheck) {
              objects.forEach(obj => {
                //  替换原始path
                if (obj.symbol == clonedPath.symbol && obj.copyCount < clonedPath.copyCount) {
                  canvas.value.remove(obj)
                }
              });
            }
            handlePathMouseDown(clonedPath)
          });
          // 添加克隆路径到画布
          canvas.value.add(clonedPath);
          //  前置path
          canvas.value.bringToFront(clonedPath)
        },);
      }
    }
  }
}
/********************************************************工具处理*********************************************************************/
watch(() => curEditorTool.value, () => {
  //  清除是否编辑标志
  isDirtyEdit.value = false
  if (curEditorTool.value == '' || curEditorTool.value == 'hd') {
    //  生成图片和高清时canvas透明化
    setCanvasOpacity(0)
  } else {
    //  其他编辑工具显示
    setCanvasOpacity(1)
  }
})
watch(() => curDrawSize.value, (newValue, oldValue) => {
  canvas.value.freeDrawingBrush.width = curDrawSize.value; // 设置笔的宽度
})
watch(() => curDrawTool.value, (newValue, oldValue) => {
  switch (newValue) {
    case 'brush':
      handleDrawLine()
      break;
    case 'eraser':
      handleEraseLine()
      handleErasablePath(true)
      break;
    case 'select':
      handleSelectLine()
      handleErasablePath(false)
      break;
    default:
      canvas.value.isDrawingMode = false
      break;
  }
}, { deep: true })
const handleErasablePath = (erasable) => {
  //  设置是否可擦除
  canvas.value.getObjects().forEach(function (obj) {
    if (obj.type === 'path') {
      obj.erasable = erasable
    }
  });
}
/********************************************************其他事件处理*********************************************************************/
//  监听加载
const animationFrameId = ref(null)
const isAnimating = ref(false)
let width = 0
let maxAutoWidth = 90;
let startTime = null
watch(() => props.loading, (newValue, oldValue) => {
  const canvasEl = canvas.value.wrapperEl // 获取canvas元素
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value)
    animationFrameId.value = null
  }
  isAnimating.value = false
  if (newValue === true) {
    isAnimating.value = true
    width = 0
    maxAutoWidth = Math.floor(Math.random() * 10) + 90;
    canvasEl.classList.add('loading-line')
    canvasEl.style.setProperty('--width', width)
    startTime = Date.now()
    const updateTimer = () => {
      if (!isAnimating.value) return
      //  计算已用时间（秒）
      const elapsed = (Date.now() - startTime) / 1000
      let damping = 0.15 * Math.exp(-0.2 * elapsed);
      damping = Math.max(0.02, damping);
      const balanceFactor = 1 - Math.pow(Math.sin(elapsed * Math.PI / (2 * 7)), 2);
      damping *= balanceFactor;
      // 动态阻尼因子
      // 增量计算：剩余空间的百分比衰减
      let increment = (maxAutoWidth - width) * damping;
      increment = Math.min(increment, loadingMaxStep.value); // 单步最大增量
      width = Math.min(maxAutoWidth, width + increment)
      canvasEl.style.setProperty('--width', width + '%')
      requestAnimationFrame(updateTimer)
    }
    animationFrameId.value = requestAnimationFrame(updateTimer)
  } else {
    canvasEl.style.setProperty('--width', '100%')
    setTimeout(() => {
      canvasEl.classList.remove('loading-line')
    }, 500)
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
      animationFrameId.value = null
    }
  }
})


//  监听触发重新生成图片
watch(() => onReGenerateImgFlag.value, (val) => {
  if (onReGenerateImgFlag.value) {
    handleReGenerateImg()
    onReGenerateImgFlag.value = false
  }
})
const handleReGenerateImg = () => {
  imgSrc.value = `file://${mediaPath.value}`
  curDrawTool.value = tempSaveDrawTool.value
  disabledDrawTool.value = false
  setCanvasOpacity(1)
}

//  监听触发保存并更新图片
watch(() => onSaveImgFlag.value, (val) => {
  if (onSaveImgFlag.value) {
    handleSaveEditImg()
    onSaveImgFlag.value = false
  }
})
const handleSaveEditImg = async () => {
  //  完成编辑
  await updateFirstMediaPath()
}
const addImgToLocal = async (tempSourceInfo) => {
  //  把图片添加到缓存中
  const res = await window.electronAPI.addSourceByBase64(
    {
      base64File: tempSourceInfo.image,
      model: tempSourceInfo.model,
    }
  );
  const sourceInfo = { fileName: res.fileName, runTime: Date.now(), ...tempSourceInfo }
  delete sourceInfo.image_base64
  delete sourceInfo.image
  return sourceInfo
}
const updateSourceList = async (sourceInfo) => {
  //  更新SourceList
  const conf = new Conf();
  let list = ((await conf.get("videoGenerationSourceList")) || []).filter(item => item);
  //  检查是否存在，不存在则更新
  if (list.some(item => item.fileName == sourceInfo.fileName)) {
    return
  }
  list.push(sourceInfo);
  list = list.map(item => {
    if ((Date.now() - item.runTime) > (7 * 24 * 60 * 60 * 1000)) {
      item.shareLink = ""
    }
    return item
  })
  await conf.set("videoGenerationSourceList", list);
  mitt.emit("updateSoureList");
}
const updateFirstMediaPath = async () => {
  //  更新选中图片为列表第一张图片
  let list = await window.electronAPI.getSourceListByFilePath();
  mediaPath.value = list[0].file
}
/********************************************************擦除*********************************************************************/
watch(() => onEraseImgFlag.value, (val) => {
  if (onEraseImgFlag.value) {
    handleErasePartImg()
    onEraseImgFlag.value = false
  }
})
//  消除
const handleErasePartImg = async () => {
  tempSaveDrawTool.value = curDrawTool.value
  curDrawTool.value = ''
  disabledDrawTool.value = true
  setCanvasOpacity(0)
  // 获取文件格式
  let base64Img = await handleGenerateImgBase64()
  const type = getImageType(base64Img[0])
  base64Img = base64Img.map(e => e.replace(/^data:image\/(\w+);base64,/, ""))
  const params = {
    model: 'zj_i2i_inpainting_remove',
    model_quality: 'H',
    image_base64: base64Img,
    max_entity: 20,
    result_format: 0,
    seed: -1,
    scale: 7,
    steps: 30,
    strength: 0.8,
    dilate_size: 15
  }
  try {
    emit("update:loading", true);
    loadingMaxStep.value = 0.5 // 进度条单步最大增量0.6%
    let response = await apiImgToImgMask(params)
    const newImg = `data:image/${type};base64,` + response.data.data.binary_data_base64
    imgSrc.value = newImg
    emit("update:loading", false);
    tempSourceInfo.value = Object.assign(tempSourceInfo.value, {
      image: newImg,
      model: params.model,
    })
    // 添加图片到本地
    const sourceInfo = await addImgToLocal(tempSourceInfo.value)
    //  更新历史列表
    await updateSourceList(sourceInfo)
  } catch (error) {
    emit("update:loading", false);
    console.log(error)
    if (error?.response?.data?.message) {
      ElMessage.error(error.response.data.message);
    }
  }
}
/********************************************************抠图*********************************************************************/
//  监听触发抠图
watch(() => onCutImgFlag.value, (val) => {
  if (onCutImgFlag.value) {
    handleCutPartImg()
    onCutImgFlag.value = false
  }
})
//  抠图
const handleCutPartImg = async () => {
  tempSaveDrawTool.value = curDrawTool.value
  curDrawTool.value = ''
  disabledDrawTool.value = true
  setCanvasOpacity(0)
  try {
    const maskData = await generateMask(canvas.value.lowerCanvasEl, imgRef.value.naturalWidth, imgRef.value.naturalHeight, 'imageData')
    const newImg = await createMaskedImage(imgRef.value, maskData)
    imgSrc.value = newImg
    tempSourceInfo.value = Object.assign(tempSourceInfo.value, {
      image: newImg,
      model: ''
    })
    // 添加图片到本地
    const sourceInfo = await addImgToLocal(tempSourceInfo.value)
    //  更新历史列表
    await updateSourceList(sourceInfo)
  } catch (error) {
    console.log(error)
  }
}
/********************************************************局部重绘*********************************************************************/
watch(() => onRepaintImgFlag.value, (val) => {
  if (onRepaintImgFlag.value) {
    handleRepaintPartImg()
    onRepaintImgFlag.value = false
  }
})
//  局部重绘
const handleRepaintPartImg = async () => {
  tempSaveDrawTool.value = curDrawTool.value
  curDrawTool.value = ''
  disabledDrawTool.value = true
  setCanvasOpacity(0)
  let base64Img = await handleGenerateImgBase64()
  const type = getImageType(base64Img[0])
  base64Img = base64Img.map(e => e.replace(/^data:image\/(\w+);base64,/, ""))
  const params = {
    model: 'zj_i2i_inpainting_edit',
    model_quality: 'H',
    image_base64: base64Img,
    prompt: repaintData.value.prompt,
    scale: repaintData.value.scale,
    seed: -1,
    steps: 30,
  }
  try {
    emit("update:loading", true);
    loadingMaxStep.value = 0.4// 进度条单步最大增量0.5%
    let response = await apiImgToImgMask(params)
    const newImg = `data:image/${type};base64,` + response.data.data.binary_data_base64
    imgSrc.value = newImg
    emit("update:loading", false);
    tempSourceInfo.value = Object.assign(tempSourceInfo.value, {
      image: newImg,
      runTime: Date.now(),
      model: params.model,
      prompt: params.prompt
    })
    // 添加图片到本地
    const sourceInfo = await addImgToLocal(tempSourceInfo.value)
    //  更新历史列表
    await updateSourceList(sourceInfo)

  } catch (error) {
    emit("update:loading", false);
    console.log(error)
    if (error?.response?.data?.message) {
      ElMessage.error(error.response.data.message);
    }
  }
}
/********************************************************高清*********************************************************************/
watch(() => onHdImgFlag.value, (val) => {
  if (onHdImgFlag.value) {
    handleHDImg()
    onHdImgFlag.value = false
  }

})
const handleHDImg = async () => {
  //  高清
  canvas.value.isDrawingMode = false;
  try {
    emit('update:loading', true)
    loadingMaxStep.value = 0.4
    const base64Img = await getBase64FromImage(imgRef.value)
    const type = getImageType(imgRef.value.src)
    const base64Data = base64Img.replace(/^data:image\/(\w+);base64,/, "")
    const params = {
      model: 'zj_lens_nnsr2_pic_common',
      image_base64: [base64Data],
      model_quality: 'HQ',
      result_format: 0,
    }
    let response = await apiImgToImgHD(params)
    const newImg = `data:image/${type};base64,` + response.data.data.binary_data_base64
    imgSrc.value = newImg
    emit("update:loading", false);
    tempSourceInfo.value = Object.assign(tempSourceInfo.value, {
      image: newImg,
      model: params.model,
    })
    // 添加图片到本地
    const sourceInfo = await addImgToLocal(tempSourceInfo.value)
    //  更新历史列表
    await updateSourceList(sourceInfo)
  } catch (error) {
    emit("update:loading", false);
    console.log(error)
    if (error?.response?.data?.message) {
      ElMessage.error(error.response.data.message);
    }
  }
}
/********************************************************图生图*********************************************************************/
watch(() => onImgToImgFlag.value, (val) => {
  if (onImgToImgFlag.value) {
    handleImgToImg()
    onImgToImgFlag.value = false
  }
})
const handleImgToImg = async () => {
  try {
    emit("update:loading", true);
    loadingMaxStep.value = 0.1// 进度条单步最大增量0.1%
    if (isDirtyEdit.value) {
      imgSrc.value = `file://${mediaPath.value}`
    }
    const formData = new FormData();
    Object.entries(imgToImgData.value).forEach(([key, value]) => {
      if (value != null && value != '' && value != 'category') {
        //处理数组
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            formData.append(`${key}`, item);
          });
        } else {
          // 非文件数组或普通字段正常添加
          formData.append(key, value);
        }
      }
    });
    let response = await apiImgToImg(formData)
    const base64List = response.data.data.binary_data_base64
    if (!base64List || base64List.length == 0) {
      ElMessage.error('生成失败');
      emit("update:loading", false);
      return
    }
    for (const imgBase64 of base64List) {
      const newImg = `data:image/png;base64,${imgBase64}`
      imgSrc.value = newImg
      tempSourceInfo.value = {
        image: newImg,
        model: imgToImgData.value.model,
        category: imgToImgData.value.category,
        prompt: imgToImgData.value.prompt,
        size: imgToImgData.value.size,
      }
      // 添加图片到本地
      const sourceInfo = await addImgToLocal(tempSourceInfo.value)
      newAddTimes.value.push(sourceInfo.runTime)
      //  更新历史列表
      await updateSourceList(sourceInfo)
    }
      emit("update:loading", false);
    await updateFirstMediaPath()
  } catch (error) {
    emit("update:loading", false);
    console.log(error)
    if (error?.response?.data?.message) {
      ElMessage.error(error.response.data.message);
    }
  }
}
//  计算是否是文生图
const isTextToImg = computed(() => imgToImgData.value.images == null || imgToImgData.value.images == '')
//  计算是否是多图参考
const isMulImgToImg = computed(() => Array.isArray(imgToImgData.value.images))
/**
 *   是否隐藏画布
 *    1.加载中并且是文生图
 *    2.加载中并且是多图参考且不是图片编辑
 * */
const hideImageCanvas = computed(() => props.loading && (isTextToImg.value)&&(curEditorTool.value===''&&isMulImgToImg.value))
</script>

<style lang="scss" scoped>
.container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 25px;
  min-height: 0;

  .source-info {
    flex: 0 0 48px;
    box-sizing: border-box;
    width: 100%;
    color: #999999;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 0;

    .source-model {
      white-space: nowrap;
    }
  }

  .image-canvas-box {
    flex: 1;
    box-sizing: border-box;
    min-height: 0;
    overflow: hidden;

    &.img-to-img {
      // background: url('@/assets/editor_bg.png') repeat;

      :deep(.image-canvas .canvas-container.loading-line::after) {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: var(--width);
        height: 100%;
        background: rgba(255, 255, 255, 0.5);
        z-index: 10;
        pointer-events: none;
        border-left: 2px solid #fff;
        border-right: 2px solid #fff;
        transition: width 0.5s linear;
      }
    }

    &.text-to-img {
      .text-loading {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 20px;
        padding-bottom: 0;
        box-sizing: border-box;
      }
    }

    .image-canvas {
      position: relative;
      left: 0;
      top: 0;
      height: 100%;

      .image {
        position: absolute;
        left: 0;
        top: 0;
        z-order: 1;
        -moz-user-select: -moz-none;
        -khtml-user-select: none;
        -webkit-user-select: none;
        -o-user-select: none;
        user-select: none;
      }

      .image-editor-canvas {
        position: absolute;
        left: 0;
        top: 0;
        z-order: 2;
      }
    }
  }
}
</style>