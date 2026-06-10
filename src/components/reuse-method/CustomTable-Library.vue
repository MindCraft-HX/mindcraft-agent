<template>
  <el-table :data="DataList" :default-sort="{ prop: 'id', order: 'ascending' }" border stripe style="width: 100%" :row-key="(row) => row.id" @row-click="handleExpandChange">
    <el-table-column label="选择" width="70" v-if="showSelect">
      <template v-slot="{ row }">
        <!-- <el-radio v-model="selectedLibrary" :label="scope.row.id" @change="pitchOnRow(scope.row)">{{ "" }}</el-radio> -->
        <el-button class="button-option" icon="SwitchButton" :type="props.selectedRowId === row.id ? 'success' : ''" style="height: 36px;width: 36px;" @click.once.stop="pitchOnRow(row)"></el-button>
      </template>
    </el-table-column>
    <el-table-column label="关注" width="90" v-if="showAttention">
      <template #default="{ row }">
        <el-switch v-model="row.attention" inline-prompt active-text="已关注" inactive-text="未关注" @change="attentionSwitch(row)" @click.stop  />
      </template>
    </el-table-column>
    <el-table-column prop="index_name" label="知识库名称">
      <template #default="{ row }">
         <div style="display: flex;">
          <div>{{row.index_name}}</div>
          <el-tag effect="dark" type="success" style="margin-left: 20px" v-if="showTag && row.followed_count !== 0 ">{{`${row.followed_count}次关注`}}</el-tag>
         </div>
      </template>
    </el-table-column>
    <el-table-column prop="file_description" label="知识库描述" v-if="showFileDescription"></el-table-column>
    <el-table-column width="180" prop="updated_at" label="更新时间" v-if="showUpdated"></el-table-column>
    <el-table-column label="操作" width="110" v-if="showOperation">
              <template #default="{ row }">
                <el-button type="primary" size="small" icon="Edit" @click.stop="openEditDialog(row)" />
                <el-button type="danger" size="small" icon="Delete" @click.stop="deleteLibrary(row)" />
                <!-- <el-dialog title="编辑" v-model="editDialogVisible" width="40%" @close="editDialogVisible = false"
                  append-to-body>
                  <el-form :model="currentRow" label-width="120px">
                    <el-form-item label="知识库名称" prop="index_name">
                      <el-input v-model="currentRow.index_name" placeholder="当前仅支持英文"></el-input>
                    </el-form-item>
                    <el-form-item label="知识库描述" prop="file_description">
                      <el-input v-model="currentRow.file_description" type="textarea" placeholder="请填写知识库描述"></el-input>
                    </el-form-item>
                    <el-form-item label="共享" prop="is_shared">
                      <el-switch v-model="currentRow.is_shared" active-text="共享" inactive-text="不共享"></el-switch>
                    </el-form-item>
                    <el-form-item>
                      <el-button type="primary" @click="editLibrary(currentRow)">保存</el-button>
                      <el-button @click="editDialogVisible = false">取消</el-button>
                    </el-form-item>
                  </el-form>
                </el-dialog> -->
              </template>
            </el-table-column>
    <el-table-column type="expand" v-if="showPullDown">
      <template #default="{ row }">
        <el-table :data="[row]" style="width: 100%">
          <el-table-column prop="file_splitter_label" label="文档分割方式"></el-table-column>
          <el-table-column prop="chunk_size" label="分割大小"></el-table-column>
          <el-table-column prop="embeddings" label="Embedding模型"></el-table-column>
          <el-table-column prop="vector_db_label" label="向量数据库"></el-table-column>
          <el-table-column prop="upload_user" label="创建用户"></el-table-column>
          <el-table-column prop="is_shared_label" label="共享"></el-table-column>
          <el-table-column prop="created_at" label="创建时间"></el-table-column>
        </el-table>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ref,watch } from 'vue';


const selectedLibrary = ref(props.selectedLibrary);
const showAttention = ref(props.showAttention);
const showOperation = ref(props.showOperation);
const showSelect = ref(props.showSelect);
const showPullDown = ref(props.showPullDown);
const showFileDescription = ref(props.showFileDescription);
const showUpdated = ref(props.showUpdated);
const showTag = ref(props.showTag);
// const selectedRowId = ref(props.selectedRowId);
const showCertain = ref(props.showCertain);
// const editDialogVisible = ref(props.editDialogVisible);
// const currentRow = ref(null);


const props = defineProps({
  DataList: Array, // 表格的List数据
  selectedLibrary: Number || String, //选中
  showAttention: Boolean, //控制关注按钮的显示
  showOperation: Boolean, //控制操作列的显示
  editDialogVisible: Boolean, //控制编辑对话框的显示
  currentRow: Object, //当前行数据
  showSelect:Boolean,
  showPullDown:Boolean,
  showFileDescription:Boolean,
  showUpdated:Boolean,
  showTag:Boolean,
  selectedRowId:Number,
  showCertain:Boolean,
});

watch(() => props.selectedLibrary, (newVal) => {
  selectedLibrary.value = newVal;
},{immediate:true});

const emit = defineEmits(["pitch-on-row", "attention-switch","open-edit-dialog","delete-library","edit-library"]);

const pitchOnRow = (row) => {
  emit('pitch-on-row', row);
};

const attentionSwitch = (row) => {
  emit('attention-switch', row);
};

const openEditDialog = (row)=>{
  emit('open-edit-dialog',row);
};

const deleteLibrary = (row)=>{
  emit('delete-library',row);
};

// const editLibrary = (row)=>{
//   emit('edit-library',row);
// };

const handleExpandChange = (row)=>{
  emit('pitch-on-row', row);
}

const clickRow = (row)=>{ 
  console.log(row);
}

</script>

<style scoped>
/* el-table_8_column_31 el-table__cell */
:deep(.button-option .el-icon){
  /* width: 36px;
  height: 36px; */
  font-size: 24px;
}

</style>