<template>
    <div>
    <codemirror
      ref="cm"
      v-model="code"
      :options="cmOptions"
    ></codemirror>
    <!-- @input="inputChange" -->
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue';
// 全局引入vue-codemirror
import { Codemirror } from 'vue-codemirror';


const cm = ref(null);
const code = ref(``);  // 使用props初始化

const props = defineProps({
  initialCode: [String, Object, Array],
});

// props.initialCode
watch(()=>props.initialCode,(val)=>{
  if (typeof val === 'string') {
    // 如果是字符串，直接使用
    code.value = val;
  } else {
    code.value = JSON.stringify(val, null, 2);
  }
},{immediate:true})

const cmOptions = {
  mode: 'text/x-sql',  //'application/json',
  theme: 'material',
  line: true,
  lineNumbers: true,
  lineWrapping: true,
  tabSize: 4,
};
</script>

<style scoped>
:deep(.cm-scroller){
    max-height: 656px;
}

</style>