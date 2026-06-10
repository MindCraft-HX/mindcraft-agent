<template>
    <div>
        <!-- 第一层 -->
        <div style="display: flex;justify-content: space-around;">
            <!-- 左边 -->
            <div>
                <textarea class="Voice_textarea"></textarea>
            </div>
            <!-- 右边 -->
            <div class="Voice_right">
                <div>请朗读左侧写的整段话并录音，生成专属语音</div>
                <audio src="" controls></audio>
                <div>
                    <el-button type="danger" style="width: 50px;">
                        <svg class="icon" aria-hidden="true" style="font-size: 20px;">
                            <use xlink:href="#icon-luzhi"></use>
                        </svg>
                    </el-button>
                    <el-button>重录</el-button>
                    <el-button>试听</el-button>
                    <el-button type="primary">确认生成voice ID</el-button>
                </div>
            </div>
        </div>
        <!-- 第二层 -->
        <div style="margin: 24px 0px">
            <p>Voice ID链接</p>
            <div style="display: flex;justify-content: space-around;">
                <div>
                    <el-input style="width: 240px" />
                    <el-button style="margin-left: 10px;" type="primary" plain :icon="CopyDocument" >
                        <!-- <svg class="icon" aria-hidden="true" style="font-size: 14px;margin-right: 10px;">
                            <use xlink:href="#icon-fuzhi-"></use>
                        </svg> -->
                        复制</el-button>
                </div>
                <div>
                    <el-input style="width: 240px" />
                    <el-button style="margin-left: 10px;" type="primary" plain>命名</el-button>
                    <el-button type="primary" plain>保存</el-button>
                </div>


            </div>
        </div>
        <!-- 第三层 -->
        <div>
            <p>Voice ID历史（最多可保留10条记录）</p>
            <div style="width: 98%;border: 1px solid #DCDFE6;height: 334px;border-radius: 10px;padding: 5px;">
            <el-table :data="filterTableData"   style="width: 100%" height="334">
                <el-table-column label="编号" prop="date" align="center" />
                <el-table-column label="Voice ID" prop="id" align="center" />
                <el-table-column label="名称" prop="name" align="center" />
                <el-table-column label="操作" align="center">
                    <template #default="scope">
                        <el-button size="small" type="primary">
                            复制
                        </el-button>
                        <el-button size="small" type="danger" plain>
                            删除
                        </el-button>
                    </template>
                </el-table-column>
            </el-table>
        </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { CopyDocument } from "@element-plus/icons-vue";


const search = ref('')
const filterTableData = computed(() =>
  tableData.filter(
    (data) =>
      !search.value ||
      data.name.toLowerCase().includes(search.value.toLowerCase())
  )
)
const handleEdit = (index,row) => {
  console.log(index, row)
}
const handleDelete = (index, row) => {
  console.log(index, row)
}

const tableData = [
  {
    date: '2016-05-03',
    name: 'Tom',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',
  },
  {
    date: '2016-05-02',
    name: 'John',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-04',
    name: 'Morgan',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-01',
    name: 'Jessy',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-01',
    name: 'Jessy',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-01',
    name: 'Jessy',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-01',
    name: 'Jessy',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-01',
    name: 'Jessy',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-01',
    name: 'Jessy',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
  {
    date: '2016-05-01',
    name: 'Jessy',
    address: 'No. 189, Grove St, Los Angeles',
    id:'fgdfggddg',

  },
]

</script>

<style scoped>
textarea:focus {
    outline: none;
}

.Voice_textarea {
    width: 40vw;
    height: 22vh;
    font-size: 16px;
    resize: none;
    border: 1px solid #DCDFE6;
    border-radius: 10px;
    padding: 4px;
    transition: all 0.3s, height 0s;
    margin-right: 5px;

    max-width: 100%;
    min-height: 32px;
    line-height: 1.5714285714285714;
    vertical-align: bottom;
}

/* 获得焦点 */
.Voice_textarea:focus {
    border-color: #3677f0;
}

.Voice_right {
    width: 40vw;
    height: 23vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-around;
}
</style>