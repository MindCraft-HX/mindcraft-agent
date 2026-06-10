<template>
<div>
    <el-card>
        {{ streamResponse.join('') }}
    </el-card>
</div>
<div>
    <el-button type="primary" @click="triggerAxios">Trigger</el-button>
</div>
</template>

<script setup>
import { ref } from 'vue'
import api from "@/utils/request";


const streamResponse = ref([])
//用axios请求，response type为stream
const triggerAxios = () => {
  api.get('llm/call_llm_stream/', {
    responseType: 'blob'
  }).then(response => {
    const reader = new FileReader();
    reader.onload = function() {
      const dataStr = reader.result.toString();
      const dataArr = dataStr.split('}{').map((item, index, array) => {
        if (index !== 0) {
          item = '{' + item;
        }
        if (index !== array.length - 1) {
          item = item + '}';
        }
        return JSON.parse(item);
      });
      dataArr.forEach(item => {
        if (item.content) {
          streamResponse.value.push(item.content);
        }
      });
    };
    reader.readAsText(response.data);
  }).catch(error => {
    console.error('请求出错', error);
  });
};
</script>