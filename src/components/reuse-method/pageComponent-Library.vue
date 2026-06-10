<template>
    <div>
        <el-pagination
          small
          background
          layout ="sizes ,prev, pager, next, total"
          class="mt-4"
          :page-sizes="[10, 20]"
          :total="total"
          :current-page="currentPage"
          v-model:page-size="pageSize"
          @current-change="handleCurrentChange"
          @size-change="handleSizeChange"
          />
    </div>
</template>

<script setup>
import { ref,computed } from "vue";

// 定义接收的props
const props = defineProps({
  total: {
    type: Number,
    required: true
  },
  pageSize: {
    type: Number,
    default: 10
  }
});

const emit = defineEmits(['update:currentPage','update:pageSize']);

// 定义一个响应式的currentPage
const currentPage = ref(1);
const pageSize =ref(10);

// 处理页码改变
function handleCurrentChange(page) {
  currentPage.value = page;
  // 触发父组件的事件，更新当前页码
  emit('update:currentPage', page);
}

function handleSizeChange(size){
  pageSize.value = size;
  emit('update:pageSize', size);
  console.log(465);
}


</script>

<style scoped></style>