<template>
  <div class="lib-card">
    <div class="card-header">
      <div class="lib-name">{{ info.index_name }}</div>
      <div style="flex: 1;"></div>
      <div class="btn-list" v-if="!isUser">
        <el-switch size="small" v-model="info.attention" inline-prompt active-text="已关注" inactive-text="未关注"
          @change="attentionSwitch(info)" @click.stop />
      </div>
      <div class="btn-list" v-else>
        <el-button type="primary" icon="Edit" @click.stop="showDialogEdit" size="small"></el-button>
        <el-button type="danger" icon="Delete" @click.stop="deleteLib" size="small"></el-button>
      </div>
    </div>
    <div class="card-text">创建时间：{{ info.created_at }}</div>
    <div class="card-bottom">
      <div class="lib-num">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenxiang1"></div>
        关注数：{{ info.followed_count }}
      </div>
      <div class="create-by">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-guanzhushu1"></div>
        <div class="overflow-ellipsis">
          创建人：{{ info.upload_user }}
        </div>
      </div>
      <div style="flex: 1;"></div>
      <div class="mindcraft-flow-win-iconfont icon-mindcraft-xinxi" @click.stop="showDialog"></div>
    </div>
    <el-dialog :append-to-body="true" @click.stop v-model="dialogVisible" :title="info.index_name" class="lib-dialog">
      <libInfoCom :libInfo="info" />
    </el-dialog>
    <el-dialog :append-to-body="true" @click.stop v-model="dialogVisibleEdit" title="编辑" class="lib-dialog">
      <el-form class="lib-form" style="max-height: 50vh;overflow: auto">
        <el-form-item>
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-mingcheng"></div>
            <div class="form-text">名称</div>：
          </template>
          <el-input class="lib-input" v-model="editInfo.index_name"></el-input>
        </el-form-item>
        <el-form-item label-position="top">
          <template #label>
            <div style="display: flex;align-items: center;">
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-xuanzeshangchuanwenjian"></div>
              <div class="form-text">选择文档</div>：<el-text class="form-tips" type="info">（当前支持txt, docx, 以及pdf格式）</el-text>
            </div>
          </template>
          <input type="file" ref="fileInput" multiple @change="handleFileChange" style="display: none" :accept="'.txt, .docx, .pdf'" />
          <el-button size="large" plain @click="$refs.fileInput.click()">上传文件</el-button>
          <div v-for="(file, index) in files" :key="index"  class="library-upload-tag" >
            <el-tag closable type="success" :disable-transitions="false" @close="tagClose(index)" size="large"
            style="margin-left: 10px">
            {{ file.name }}
            </el-tag>
          </div>
        </el-form-item>
        <el-form-item style="min-height: 114px;">
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-miaoshu"></div>
            <div class="form-text">描述</div>：
          </template>
          <el-input class="lib-input" v-model="editInfo.file_description" type="textarea" rows="4"></el-input>
        </el-form-item>
        <el-form-item style="min-height: 84px;">
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-shiyongzhinan"></div>
            <div class="form-text">使用指南</div>：
          </template>
          <el-input class="lib-input" v-model="editInfo.file_desc" type="textarea" rows="4"></el-input>
        </el-form-item>
        <el-form-item>
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-zhishikuleixing"></div>
            <div class="form-text">知识库类型</div>：
          </template>
          <el-select class="lib-input" v-model="editInfo.db_category" placeholder="选择文档分段方法">
            <el-option v-for="item in db_category_options" :key="item.value" :label="item.label"
              :value="item.value"/>
          </el-select>
        </el-form-item>
        <template v-if="editInfo.db_category === 'vector'">
          <div style="display: flex;align-items: center;">
            <el-form-item style="width: 50%;margin-right: 5px;">
              <template #label>
                <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduanfangshi"></div>
                <div class="form-text">文档分段方式</div>：
              </template>
              <el-select class="lib-input" v-model="editInfo.file_splitter" placeholder="选择文档分段方法">
                <el-option v-for="item in filesplit_options" :key="item.filesplit_value" :label="item.filesplit_label"
                  :value="item.filesplit_value" :disabled="item.disabled" />
              </el-select>
            </el-form-item>
            <el-form-item style="width: 50%;">
              <template #label>
                <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduandaxiao"></div>
                <div class="form-text">分段大小</div>：
              </template>
              <el-input-number class="lib-input" v-model="editInfo.chunk_size" :min="1" :max="5000"></el-input-number>
            </el-form-item>
          </div>
          <el-form-item>
            <template #label>
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-moxing"></div>
              <div class="form-text">Embedding模型</div>：
            </template>
            <el-select class="lib-input" v-model="editInfo.embeddings" placeholder="选择Embedding模型">
              <el-option v-for="item in modelList" :key="item.id" :label="item.model_content"
                  :value="item.model_name" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <template #label>
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-xiangliangshujuku"></div>
              <div class="form-text">向量数据库</div>：
            </template>
            <el-select class="lib-input" v-model="editInfo.vector_db" placeholder="选择向量数据库" >
              <el-option v-for="item in vector_db_options" :key="item.vdb_value" :label="item.vdb_label"
                :value="item.vdb_value" :disabled="item.disabled" />
            </el-select>
          </el-form-item>
          <el-form-item >
            <template #label>
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduandaxiao"></div>
              <div class="form-text">返回结果数量</div>：
            </template>
            <el-input-number class="lib-input" v-model="editInfo.top_k" :min="1" :max="15"></el-input-number>
          </el-form-item>
        </template>
        <el-form-item>
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-shifougongxiang"></div>
            <div class="form-text">是否分享</div>：
          </template>
          <el-switch size="large" v-model="editInfo.is_shared" inline-prompt active-text="分享" inactive-text="不分享"></el-switch>
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="width: 100%;display: flex;align-items: center;justify-content: center;">
          <el-button type="primary" @click="saveEdit">保存</el-button>
          <el-button type="primary" plain @click="dialogVisibleEdit = false">取消</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { postFollowLibrary } from '@/api/mainActivity/Library';
import libInfoCom from "./libInfo.vue";
const props = defineProps({
  info: {
    type: Object,
    default: () => ({})
  },
  modelList: {
    type: Array,
    default: () => ([])
  }
})
const emit = defineEmits(['change'])

const attentionSwitch = async (row) => {
  try {
    if (row.attention === true) {
      await postFollowLibrary(row.id)
      ElMessage.success('关注成功');
    } else {
      await postFollowLibrary(row.id)
      ElMessage.error('取消关注');
    }
  } catch (error) {
    console.log(error);
  }
};

const dialogVisible = ref(false)
const showDialog = () => {
  dialogVisible.value = true
}

const isUser = computed(() => {
  const username = localStorage.getItem("username");
  return username == props.info.upload_user;
})

import { RemoveLibraryList } from '@/api/mainActivity/Library';
const deleteLib = () => {
  ElMessageBox.confirm('确定删除该知识库吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then((res) => {
    if(res == 'confirm') {
      RemoveLibraryList(props.info.id).then(() => {
        ElMessage.success('删除成功');
        emit('change')
      })
      .catch((error) => {
        ElMessage.error('删除失败');
      })
    }
  })
}

/************* 编辑知识库 *************/
const editInfo = ref({})
const dialogVisibleEdit = ref(false)
const showDialogEdit = () => {
  editInfo.value = JSON.parse(JSON.stringify(props.info))
  dialogVisibleEdit.value = true
}

const fileUploaded = ref(false); // 用来标记文件是否已上传

// 添加知识库功能
// 导入文件
const libraryFile = ref(null);
const fileName = ref("");
const files = ref([]);
const handleFileChange = (event) => {
  // 获取所有选中的文件
  const selectedFiles = event.target.files;
  // 清空之前的文件列表
  // files.value = [];
  // 遍历所有文件，添加到文件列表中
  for (let i = 0; i < selectedFiles.length; i++) {
    files.value.push(selectedFiles[i]); // 添加文件到数组
  };
  console.log(files.value,'files.value>>>>>>>>>>..');
  // 获取选中的文件
  const file = event.target.files[0];
  // 保存文件到数组中
  libraryFile.value = file;
  // 保存文件名
  fileName.value = file.name;
  // 在控制台打印文件信息，以确保这个函数被正确调用
  fileUploaded.value = files.value.length > 0;
};
// 删除文件
const tagClose = (index) => {
  files.value.splice(index, 1); // 移除指定索引的文件
  fileUploaded.value = files.value.length > 0;
};

const deleteClose = ()=>{
  libraryFile.value = null;
  fileName.value = "";
  files.value = [];
  fileUploaded.value = files.value.length > 0;
}

const db_category_options = [
  {
    value: "vector",
    label: "向量分段",
  },
  {
    value: "full_context",
    label: "全文",
  }
]
const filesplit_options = [
  {
    filesplit_value: "by_code",
    filesplit_label: "标准分段",
  },
  {
    filesplit_value: "by_ai",
    filesplit_label: "智能分段",
    disabled: true,
  },
];

const vector_db_options = [
  {
    vdb_value: "faiss",
    vdb_label: "FAISS",
  },
  {
    vdb_value: "pinecone",
    vdb_label: "Pinecone",
    disabled: true,
  },
];


import { modifyLibraryList } from '@/api/mainActivity/Library';
const saveEdit = async () => {
  const libraryformData = new FormData();
  libraryformData.append("index_name", editInfo.value.index_name);
  files.value.forEach(file => {
    libraryformData.append("files[]", file);
  });
  libraryformData.append("file_description", editInfo.value.file_description);
  libraryformData.append("file_desc", editInfo.value.file_desc);
  libraryformData.append("db_category", editInfo.value.db_category);
  libraryformData.append("file_splitter", editInfo.value.file_splitter);
  libraryformData.append("chunk_size", editInfo.value.chunk_size);
  libraryformData.append("embeddings", editInfo.value.embeddings);
  libraryformData.append("vector_db", editInfo.value.vector_db);
  libraryformData.append("top_k", editInfo.value.top_k);
  libraryformData.append("is_shared", editInfo.value.is_shared);
  try {
    await modifyLibraryList(editInfo.value.id, libraryformData);
    // console.log(response.data.message);
    // 在这里执行编辑后的操作，例如刷新列表等
    //用elmessge提示编辑成功
    ElMessage.success("知识库编辑成功");
    dialogVisibleEdit.value = false;
    emit("change")
    deleteClose();
  } catch (error) {
    ElMessage.error("知识库编辑失败");
    console.log(error);
  }

}
/************* 编辑知识库 *************/

</script>

<style lang="scss" scoped>
@import url("./lib.scss");
</style>