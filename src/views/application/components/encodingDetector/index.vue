<template>
  <div style="display: flex;">
    <sidebar title='字符编码查询器' :menuList="[{name: '字符编码查询器'}]"/>
    <div class="encoding-detector">
      <div class="header-title" style="margin: 10px;font-size: 20px;">字符编码查询器</div>
      <el-card shadow="hover" class="input-card">
        <template #header><div class="header-title">转码前</div></template>
        <div class="input-content">
          <div class="encoding-line">
            输入：<el-select v-model="inputType">
              <el-option  v-for="item, index in options" :key="index" :label="item.label" :value="item.value"></el-option>
            </el-select>
            <br>
            <div v-if="inputType != '文字'">为保证结果准确，请使用英文逗号拼接为16进制字符串，例如：0x31,0x31,0x31,0x31</div>
          </div>
        </div>
        <el-input type="textarea" :rows="4" v-model="inputValue"></el-input>
      </el-card>
      <el-card shadow="hover" class="input-card" v-loading="transcoding">
        <template #header><div class="header-title">转码后</div></template>
        <div class="input-content">
          <el-radio-group class="encoding-line" v-model="radio1">
            <el-radio-button label="单独" value="单独" :disabled="inputType != '文字'"/>
            <el-radio-button label="连续" value="连续" />
          </el-radio-group>
          <div class="encoding-line">
            字符编码：<el-select v-model="outputType">
              <el-option  v-for="item, index in options" :key="index" :label="item.label" :value="item.value"></el-option>
            </el-select>
          </div>
          <div class="encoding-line">
            <el-button :disabled="radio1 == '单独' || !outputValue" @click="copyMessage(outputValue)">复制</el-button>
            <el-button type="primary" @click="conversion" :disabled="inputType != '文字' && radio1 == '单独'">转换</el-button>
          </div>
        </div>
        <el-input type="textarea" :rows="4" v-model="outputValue" v-if="radio1 != '单独'"></el-input>
        <div class="encoding-one" v-else>
          <el-card shadow="hover" class="encoding-item" v-for="item, index in allEncodeList" :key="index">
            <div class="item-tag" :class="[`item-tag-${index2}`]" v-for="item2, index2 in item.encode" :key="index2">
              <el-tag style="margin-right: 20px;width: 80px;">{{item2.type}}</el-tag>
              <el-tag :type="index2 == 0 ?'info' : 'success'" style="min-width: 80px;">{{item2.value}}</el-tag>
            </div>
          </el-card>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import sidebar from "@/views/application/components/sidebar.vue";
import { ref } from "vue"
import { ElMessage } from "element-plus";

const activeIndex = ref(0)

const options = [
  {
    value: '文字',
    label: '文字'
  },
  {
    value: 'UTF-8',
    label: 'UTF-8'
  },
  {
    value: 'GB18030',
    label: 'GB18030'
  },
  {
    value: 'GBK',
    label: 'GBK'
  },
  {
    value: 'GB2312',
    label: 'GB2312'
  },
  {
    value: 'utf-16be',
    label: 'Unicode'
  },
  {
    value: 'BIG5',
    label: 'BIG5'
  },
]
const inputType = ref('文字')
const inputValue = ref('')
const outputType = ref('UTF-8')
const outputValue = ref('')
const radio1 = ref('连续')
const transcoding = ref(false)
const conversion = async () => {
  transcoding.value = true
  if(radio1.value == '单独'){
    outputValue.value = ''
    await allEncode()
  } else {
    outputValue.value = await encode(inputType.value, outputType.value, inputValue.value)
  }
  transcoding.value = false
}
const allEncodeList = ref([])
const allEncode = async() => {
  allEncodeList.value = []
  const textArray = inputValue.value.split('')
  for(let i = 0; i < textArray.length; i++){
    const textInfo = {
      text: textArray[i],
      encode: []
    }
    for(let j = 0; j < options.length; j++){
      const value = await encode(inputType.value, options[j].value, textArray[i])
      textInfo.encode.push({value: new Array().concat(...value).join(','), type: options[j].label})
    }
    allEncodeList.value.push(textInfo)
  }
}
const encode = async(iType, oType, iValue) => {
  try {
    let result = null
    if(iType == oType){
      result = iValue
      return result
    }
    if(iType == '文字'){
      const value = await window.electronAPI.getEncodingList({
        fn: 'encode',
        data: iValue,
        type: oType
      })
      console.log(value)
      result = new Array().concat(...value).map(item => '0x' + item.toString(16).padStart(2, '0').toUpperCase())
    } else if (oType == '文字'){
      const data = iValue.split(',').map(item => item.replace('0x', '')).map(item => parseInt(item, 16))
      console.log(data)
      result = await window.electronAPI.getEncodingList({
        fn: 'decode',
        data,
        type: iType
      })
    } else {
      const data = iValue.split(',').map(item => item.replace('0x', '')).map(item => parseInt(item, 16))
      const decodeText = await window.electronAPI.getEncodingList({
        fn: 'decode',
        data,
        type: iType
      })
      console.log(decodeText)
      const value = await window.electronAPI.getEncodingList({
        fn: 'encode',
        data: decodeText,
        type: oType
      })
      console.log(value)
      result = new Array().concat(...value).map(item => '0x' + item.toString(16).padStart(2, '0').toUpperCase())
    }
    return result
  } catch (error) {
    console.log(error)
    ElMessage.error("无法解析");
    return null
  }
}
const copyMessage = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage("已复制到剪贴板");
  } catch (error) {
    console.error("复制失败:", error);
  }
};
</script>

<style lang="scss">
*{
  box-sizing: border-box;
}
.encoding-detector{
  width: 100%;
  height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  .input-card{
    padding: 6px;
    flex-shrink: 0;
    margin: 6px;
  }
  .header-title{
    border-left: #409eff 4px solid;
    padding-left: 6px;
  }
  .input-content{
    margin: 6px 0;
    display: flex;
    align-items: center;
    width: 100%;
    .encoding-line{
      margin-right: 6px;
      white-space: nowrap;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      .el-select {
        width: 230px;
        min-width: 230px;
      }
    }
  }
  .encoding-one{
    display: flex;
    justify-content: flex-start;
    align-items: center;
    flex-wrap: wrap;
    .encoding-item{
      margin: 6px;
      .item-tag{
        display: flex;
        // justify-content: space-between;
        align-items: center;
        margin: 6px;
      }
    }
  }
}
</style>