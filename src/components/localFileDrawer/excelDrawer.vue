<template>
    <div>
        <!-- 抽屉 -->
        <el-drawer v-model="isExcelDrawerVisible" title="Excel" :with-header="false" size="80%" @open="initializeExcel"
            @close="destroyExcel">
            <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 5px;
        ">
                <div style="color: #a5aeae">Excel：</div>
                <div>
                    <!-- 下载 -->
                    <el-button type="primary" @click="retryRequest">重试</el-button>
                    <el-button type="primary">优化格式</el-button>
                    <!-- <el-button type="primary" :icon="FolderOpened"  >打开文件夹</el-button> -->
                    <el-button type="primary" :icon="Download" @click="DownloadExcel">另存为</el-button>
                </div>
            </div>
            <!-- 渲染流程图  -->
            <div class="Excel-container">
                <vue-office-excel :src="excel" @rendered="rendered" style="width: 100%; height: 100%;" />
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, watchEffect } from "vue";
import { Plus, Minus, Download, Hide, FolderOpened } from "@element-plus/icons-vue";
//引入VueOfficeExcel组件
import VueOfficeExcel from '@vue-office/excel';
//引入相关样式
import '@vue-office/excel/lib/index.css';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';


const isExcelDrawerVisible = ref(false);
const excel = ref(null);


const props = defineProps({
    ExcelObj: {
        type: Array,
    }
});

const emit = defineEmits(["deleteExcelObj","resetChart"]);


const initializeExcel = async () => {

    // // 创建一个新的Excel工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    // 添加列标题
    worksheet.columns = Object.keys(props.ExcelObj[0]).map(key => ({ header: key, key }));

    // 添加行数据
    props.ExcelObj.forEach(data => {
        worksheet.addRow(data);
    });

    // 设置单元格对齐方式
    worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
    });

    // 将工作簿转换为二进制数据
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    excel.value = URL.createObjectURL(blob);
};

const destroyExcel = () => {
    if (excel.value) {
        URL.revokeObjectURL(excel.value);
        excel.value = null;
        emit('deleteExcelObj');
    }
};

const rendered = () => { };

// 下载文件
const DownloadExcel = ()=>{
    if (excel.value) {
    saveAs(excel.value, 'data.xlsx');
  } else {
    console.error('Excel blob is not generated yet.');
  }

};

// function rendered(){
//       console.log("渲染完成")
//     }

const retryRequest = ()=>{
    emit('resetChart');
    isExcelDrawerVisible.value = false;
}


defineExpose({
    isExcelDrawerVisible
});
</script>

<style scoped>
.Excel-container {
    height: 95%;
    border: 1px solid #a5aeae;
    border-radius: 10px 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}

.dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
}

:deep(.el-dialog__footer) {
    text-align: left;
}

.dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
}

/* .el-dialog__header{
  margin: 16px;
  border-bottom: 1px solid #000;
} */
:deep(.el-dialog__header) {
    margin: 16px;
    border-bottom: 1px solid #c7c7c9;
}

:deep(.el-dialog__title) {
    margin-left: -20px;
}
</style>
