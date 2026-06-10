<!-- 图片编辑侧边抽屉 -->
<!-- 2025/6/25 图片编辑和文生图合并成图片生成 -->
<template>
  <div class="img-edit-form">
    <el-form label-width="80px" width="90%" label-position="left" class="form-container">
      <!-- 当前图片 -->
      <CurImage :value='mediaPath' v-if="curEditorTool !== ''" />
      <!-- 消除  -->
      <template v-if="curEditorTool === 'hd'">
        <el-form-item v-if="isDirtyEdit && !loading" label-width="0px" class="btn-form-item">
          <el-button type="primary" class="small-btn" @click="handleSaveEditImg">
            完成编辑
          </el-button>
          <el-button type="primary" class="small-btn" @click="handleHdImg">
            重新编辑
          </el-button>
        </el-form-item>
        <el-form-item v-else label-width="0px" class="btn-form-item">
          <el-button type="primary" class="btn" :loading="!!loading" @click="handleHdImg">
            高清
            <el-text class="btn-price" v-if="!isNaN(maskDataList[2].price / 0.8)">
              <div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ userType ? maskDataList[2].price
                :
                (maskDataList[2].price / 0.8) }} 积分
            </el-text>
            <el-text class="btn-price" v-else>{{ maskDataList[2].price }} 积分</el-text>
          </el-button>
          <el-text class="tips-price" v-if="!isNaN(maskDataList[2].price / 0.8)">
            <div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ !userType ? maskDataList[2].price
              :
              (maskDataList[2].price / 0.8) }} 积分
          </el-text>

        </el-form-item>
      </template>
      <template v-else-if="curEditorTool === 'erase'">
        <el-form-item v-if="isDirtyEdit && !loading" label-width="0px" class="btn-form-item">
          <el-button type="primary" class="small-btn" @click="handleSaveEditImg">
            完成编辑
          </el-button>
          <el-button type="primary" class="small-btn" @click="handleReReGenerateImg">
            重新编辑
          </el-button>
        </el-form-item>
        <el-form-item v-else label-width="0px" class="btn-form-item">
          <!-- !!loading&&curDrawTool!=='select'  加载为true并且不是快速选中工具（因为快速选中也需要请求网络，但是不是按钮事件的加载） -->
          <el-button type="primary" class="btn" :disabled="!hasPaint" :loading="!!loading && curDrawTool !== 'select'"
            @click="handleErasePartImg">
            消除
            <el-text class="btn-price" v-if="!isNaN(maskDataList[0].price / 0.8)">
              <div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ userType ? maskDataList[0].price
                :
                (maskDataList[0].price / 0.8) }} 积分
            </el-text>
            <el-text class="btn-price" v-else>{{ maskDataList[0].price }} 积分</el-text>
          </el-button>
          <el-text class="tips-price" v-if="!isNaN(maskDataList[0].price / 0.8)">
            <div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ !userType ? maskDataList[0].price
              :
              (maskDataList[0].price / 0.8) }} 积分
          </el-text>
        </el-form-item>
      </template>
      <!-- 抠图 -->
      <template v-else-if="curEditorTool === 'cut'">
        <el-form-item v-if="isDirtyEdit && !loading" label-width="0px" class="btn-form-item">
          <el-button type="primary" class="small-btn" @click="handleSaveEditImg">
            完成编辑
          </el-button>
          <el-button type="primary" class="small-btn" @click="handleReReGenerateImg">
            重新编辑
          </el-button>
        </el-form-item>
        <el-form-item v-else label-width="0px" class="btn-form-item">
          <el-button type="primary" class="btn" :disabled="!hasPaint" :loading="!!loading && curDrawTool !== 'select'"
            @click="handleCutPartImg">
            抠图
          </el-button>
        </el-form-item>
      </template>
      <!--  局部重绘 -->
      <template v-else-if="curEditorTool === 'paint'">
        <inputCom :paramsItem='repaintParamsList[0]' v-model:value="repaintData.prompt">
        </inputCom>
        <el-form-item label="重绘程度调节" label-width="110px" class="form-item">
          <div class="slider-container">
            <el-slider v-model="repaintData.scale" :min="1" :max="20" />
            <div class="num">{{ repaintData.scale }}</div>
          </div>
        </el-form-item>
        <el-form-item v-if="isDirtyEdit && !loading" label-width="0px" class="btn-form-item">
          <el-button type="primary" class="small-btn" @click="handleSaveEditImg">
            完成编辑
          </el-button>
          <el-button type="primary" class="small-btn" @click="handleReReGenerateImg">
            重新编辑
          </el-button>
        </el-form-item>
        <el-form-item v-else label-width="0px" class="btn-form-item">
          <el-button type="primary" class="btn" :disabled="!hasPaint" :loading="!!loading && curDrawTool !== 'select'"
            @click="handleRepaintPartImg">
            局部重绘
            <el-text class="btn-price" v-if="!isNaN(maskDataList[1].price / 0.8)">
              <div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ userType ? maskDataList[1].price
                :
                (maskDataList[1].price / 0.8) }} 积分
            </el-text>
            <el-text class="btn-price" v-else>{{ maskDataList[1].price }} 积分</el-text>
          </el-button>
          <el-text class="tips-price" v-if="!isNaN(maskDataList[1].price / 0.8)">
            <div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ !userType ? maskDataList[1].price
              :
              (maskDataList[1].price / 0.8) }} 积分
          </el-text>
        </el-form-item>
      </template>
      <template v-else-if="curEditorTool === ''">
        <!--  图生图或文生图 -->
        <div class="img-edit-attList">
          <attrList ref="attrListRef" v-model:modelList="vincentDiagramData" v-model:data="imgToImgData"
            type="textToImage" @change-upload="onChangeUpload" />
        </div>
        <el-form-item label-width="0px" class="btn-form-item">
          <el-button type="primary" style="width: 250px; height: 40px; font-size: 18px" @click="handleImgGenerateImg"
            :loading="loading">
            <template v-if="!!loading">
              <span>生成中...</span>
            </template>
            <template v-else>
              <div class="start-icon"></div>
              <span>生成图片</span>
            </template>
            <el-text class="btn-price" v-if="!isNaN(activeModelPrice / 0.8)">
              <div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ userType ? activeModelPrice
                :
                (activeModelPrice / 0.8) }} 积分
            </el-text>
            <el-text class="btn-price" v-else>{{ activeModelPrice }} 积分</el-text>
          </el-button>
          <el-text class="tips-price" v-if="!isNaN(activeModelPrice / 0.8)">
            <div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ !userType ? activeModelPrice
              :
              (activeModelPrice / 0.8) }} 积分
          </el-text>
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup>
import {
  nextTick, ref, onMounted, watch, computed
} from "vue";
import { apiImgToImgParams } from '@/api/application/imgEdit.js'
import attrList from "@/views/application/components/speechLab/VideoGeneration/components/attr/index.vue";
import inputCom from '@/views/application/components/speechLab/VideoGeneration/components/attr/input.vue'
import CurImage from './curImage.vue'
import { Conf } from "electron-conf/renderer";
import { useMitt } from "@/utils/mitt.js";
import { useImgEditStore } from '@/stores/imgEdit.js'
import { storeToRefs } from 'pinia';
import { ElMessage } from "element-plus";
const mitt = useMitt();
const imgEditStore = useImgEditStore()
const { hasPaint, curEditorTool, curDrawTool, mediaPath, isDirtyEdit, repaintData, imgToImgData, onEraseImgFlag, onCutImgFlag, onSaveImgFlag, onReGenerateImgFlag, onRepaintImgFlag, onHdImgFlag, onImgToImgFlag, newAddTimes } = storeToRefs(imgEditStore)
const props = defineProps(["loading"]);
const emit = defineEmits(["update:loading"]);
//  图生图
onMounted(() => {
  getImgModelList();
})
/**********************************************加载表单数据******************************************************/
const vincentDiagramData = ref([])
const maskData = ref([]) // 局部编辑蒙版数据
const getImgModelList = async () => {
  const res = await apiImgToImgParams();
  vincentDiagramData.value = res.data.data
  maskData.value = res.data.mask_data
  initVincentDiagram();
  getmaskArr(); //计算局部编辑的积分
}

const initVincentDiagram = () => {
  if (vincentDiagramData.value.length) {
    const firstModel = vincentDiagramData.value[0].params_list[0].dataRange[0].value;
    const category = vincentDiagramData.value[0].category
    imgToImgData.value = {
      category: category,
      model: firstModel,
      prompt: "",
    };
    nextTick(() => {
      attrListRef.value?.changeModel(imgToImgData.value.model)
    })
  }
};
/*************************************************图片同步更新**********************************************************/
//  获取当前model的上传图片的参数
const imageParams = computed(() => {
  const vincentDiagram = vincentDiagramData.value.find((item) => {
    const modelParams = item.params_list.find(p => p.paramName === 'model')
    return modelParams.dataRange.some(d => d.value === imgToImgData.value?.model)
  })
  return vincentDiagram?.params_list.find(e => e.htmlType && e.htmlType === 'upload')?.paramName

})
watch(() => mediaPath.value, async () => {
  if (imageParams.value && imageParams.value !== '') {
    if (!mediaPath.value) {
      imgToImgData.value[imageParams.value] = null
      return
    }
    // 使用 fetch 获取文件内容
    const response = await fetch(`file://${mediaPath.value}`);
    const blob = await response.blob();
    // 获取文件名
    const fileName = window.electronAPI.pathBasename(mediaPath.value)
    // 将 Blob 转换为 File 对象
    const file = new File([blob], fileName, { type: blob.type });
    imgToImgData.value[imageParams.value] = file
  }
})
const onChangeUpload = async (val) => {
  if (!val.file) return
  //  同步图片
  if (val.type === 'drop') {
    // 如果是拖拽则直接同步图片
    mediaPath.value = val.path
  } else {
    //  如果是点击上传,则需要将图片进行缓存到资源路径中
    let res = ''
    if (val.isCompress) {
      // 如果是压缩图片，则用base64方式储存
      res = await window.electronAPI.addSourceByBase64(
        {
          base64File: val.compressedFile.afterSrc,
          model: val.compressedFile.file.name.replace(/\.[^/.]+$/, "") + '_compressed',
        }
      );
    } else {
      // 不是压缩图片，则用复制路径方式存储
      res = await window.electronAPI.addSourceByUpload({
        filePath: val.path,
        model: 'rawUpload',
      });
    }
    await updateSourceList(res);
    await updateFirstMediaPath()
  }
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
  return list
}

const updateFirstMediaPath = async () => {
  //  更新选中图片为列表第一张图片
  let list = await window.electronAPI.getSourceListByFilePath();
  mediaPath.value = list[0].file
}
/*****************************************************按钮事件*********************************************************/
//  消除
const handleErasePartImg = () => {
  onEraseImgFlag.value = true
  // 接口请求逻辑在./canvasContainer.vue中实现
  isDirtyEdit.value = true
  newAddTimes.value = []
}
// 抠图
const handleCutPartImg = async () => {
  onCutImgFlag.value = true
  isDirtyEdit.value = true
  newAddTimes.value = []
}
//  重新生成
const handleReReGenerateImg = async () => {
  onReGenerateImgFlag.value = true
  isDirtyEdit.value = false
  newAddTimes.value = []
}
const repaintParamsList = ref([
  {
    paramName: "prompt", isRequired: 1, dataType: "str", title: "局部重绘",
    description: "描述想要重新绘制的内容，不填将基于原图生成"
  }
])
//  局部重绘
const handleRepaintPartImg = () => {
  // 判断必填项
  if (repaintData.value.prompt === '') {
    ElMessage.warning('局部重绘为必填项！')
    return
  }
  onRepaintImgFlag.value = true
  isDirtyEdit.value = true
  newAddTimes.value = []
}
//高清
const handleHdImg = () => {
  onHdImgFlag.value = true
  isDirtyEdit.value = true
  newAddTimes.value = []
}
const attrListRef = ref(null)

// 保存图片
const handleSaveEditImg = async (resImg, type) => {
  onSaveImgFlag.value = true
}


// 校验必填项
const handleValidate = (form, data) => {
  let hasError = false;

  const validateItem = (item) => {
    // 1. 检查当前项是否为必填项
    if (item.isRequired === 1) {
      const value = data[item.paramName];
      if (item.dataType !== 'array') {
        if (value === null || value === undefined || value === '') {
          ElMessage.warning(`${item.title}为必填项！`);
          hasError = true;
        }
      }
    }

    // 2. 处理数组类型的参数（如 reference_images）
    if (item.htmlType === 'array' && item.iter_list) {
      let len = data[item.iter_list[0].paramName]?.length || 0
      item.iter_list.forEach(iterItem => {
        const arrayData = data[iterItem.paramName] || [];
        // 检查数组长度
        if (item.dataMin && arrayData.length < item.dataMin) {
          ElMessage.warning(`${item.title}至少需要${item.dataMin}组！`);
          hasError = true;
        }
        if (item.dataMax && arrayData.length > item.dataMax) {
          ElMessage.warning(`${item.title}最多只能${item.dataMax}项组！`);
          hasError = true;
        }
        //  判断数组的每一项的长度是否一致
        // 例如ref_images:[]的长度必须和obj_or_bg:[]的长度一致
        if (arrayData.length !== len) {
          ElMessage.warning(`${iterItem.title}为必填项！`);
          hasError = true;
        }
        //  判断数组的每一项是否为空
        arrayData.forEach(arrItem => {
          if (arrItem === null || arrItem === undefined || arrItem === '') {
            ElMessage.warning(`${iterItem.title}为必填项！`);
            hasError = true;
          }
        })
      })
    }
    // 3.处理单选项 如果单选项为必填,那么验证选中项
    if (item.htmlType === 'radio-group' && item.isRequired === 1) {
      const radioValue = data[item.paramName];
      const selectedItem = item.dataRange.find(e => e.value === radioValue);
      const selectedValue = data[selectedItem.paramName]
      if (!selectedValue) {
        ElMessage.warning(`请选择${selectedItem.title}！`);
        hasError = true;
      }
    }

    // 4. 递归处理 dataRange 中的嵌套结构
    if (item.dataRange) {
      const selectedValue = data[item.paramName];
      const selectedItem = item.dataRange.find(e => e.value === selectedValue);
      if (selectedItem) {
        validateNestedStructure(selectedItem);
      }
    }
  };

  const validateNestedStructure = (struct) => {
    if (struct.params_list) {
      struct.params_list.forEach(validateItem);
    }
  };

  // 开始验证
  if (form.params_list) {
    form.params_list.forEach(validateItem);
  }

  return hasError;
};
//  图生图
const handleImgGenerateImg = async () => {
  //  校验
  const categoryList = vincentDiagramData.value.find(e => e.name === imgToImgData.value.category)
  if (categoryList == null) return
  if (handleValidate(categoryList, imgToImgData.value)) return
  isDirtyEdit.value = true
  onImgToImgFlag.value = true
  newAddTimes.value = []
}
/**************************************************积分处理****************************************************/
const activeModel = computed(() => {
  let model = {}
  if (!imgToImgData.value.model || !vincentDiagramData.value.length) return model
  vincentDiagramData.value.map((item) => {
    if (item?.extra_data?.model_list?.[imgToImgData.value.model]) {
      model = item?.extra_data?.model_list?.[imgToImgData.value.model]
      model.model = imgToImgData.value.model
    }
  })
  return model
})
// 计算当前选中的品牌
const activeBrand = computed(() => {
  const vincentDiagram = vincentDiagramData.value.find((item) => {
    const modelParam = item.params_list.find(p => p.paramName === 'model')
    return modelParam.dataRange.some(d => d.value === imgToImgData.value?.model)
  })
  return vincentDiagram || {};
})
import { userVipTypeStore } from '@/stores/vipType';
const VipTypeStore = userVipTypeStore();
const userType = computed(() => {
  const res = VipTypeStore.vip_level > 0
  return res
})
// 计算当前的图生图积分
const activeModelPrice = ref(activeModel.model_price)
//  计算积分，通过如果有选中other_points里的参数，就再原有的积分上加加分
watch(() => imgToImgData.value, () => {
  activeModelPrice.value = activeModel.value.model_price
  for (let item in activeBrand.value.other_points) {
    if (imgToImgData.value[item] !== '') {
      activeModelPrice.value += activeBrand.value.other_points[item]
    }
  }
}, { deep: true })
//  局部编辑积分计算
const maskDataList = ref([{
  name: '擦除',
  value: 'zj_i2i_inpainting_remove',
  price: 0,
}, {
  name: '局部编辑',
  value: 'zj_i2i_inpainting_edit',
  price: 0,
}, {
  name: '高清',
  value: 'zj_lens_nnsr2_pic_common',
  price: 0,
}])
const getmaskArr = () => {
  maskDataList.value = maskDataList.value.map((e) => {
    e.price = maskData.value?.[0].extra_data.model_list[e.value].model_price
    return e
  })
}


</script>
<style lang="scss"></style>

<style lang="scss" scoped>
.img-edit-form {
  :deep(.el-form-item__label) {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
  }

  :deep(.img-edit-attList .attr-content) {
    display: flex;

    .el-col-16 {
      flex: 1;
    }
  }

  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
  }

  .start-icon {
    width: 22px;
    height: 22px;
    background-size: 100% 100%;
    background-image: url("@/assets/videoGeneration/start.png");
    margin-right: 5px;
  }

  .btn {
    width: 250px;
    height: 40px;
    font-size: 18px;
  }

  :deep(.el-form-item .el-form-item__content) {
    display: flex;
    justify-content: center;
  }

  .form-item {
    margin-left: 18px;
    margin-right: 18px;
  }

  .small-btn {
    height: 40px;
    width: 119px;
    font-size: 18px;
  }

  .slider-container {
    width: 100%;
    display: flex;
    gap: 10px;

    :deep(.el-slider .el-slider__runway) {
      background-color: #323C4D;
      height: 11px;
    }

    :deep(.el-slider .el-slider__bar) {
      height: 11px;
    }

    :deep(.el-slider__button-wrapper) {
      top: -12px;
    }

    :deep(.el-slider .el-slider__button) {
      border-radius: 2px;
      ;
      background-color: #409eff;
      width: 2px;
      height: 16px;
    }
  }

  .start-icon {
    width: 22px;
    height: 22px;
    background-size: 100% 100%;
    background-image: url("@/assets/videoGeneration/start.png");
    margin-right: 5px;
  }

  .vip-icon {
    background-image: url("@/assets/VIP1.png");
    background-position: center;
    background-repeat: no-repeat;
    background-size: auto 100%;
    width: 26px;
    height: 10px;
  }

  .vip-icon-active {
    background-image: url("@/assets/VIP2.png");
  }

  .btn-price {
    display: flex;
    align-items: center;
    color: #fff;
    margin-left: 6px;
  }

  .tips-price {
    display: flex;
    flex: 1;
    justify-content: flex-end;
    align-items: center;
    padding-right: 72px;
  }
}
</style>