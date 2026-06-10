<template>
  <div class="create">
    <div class="lib-title">创建知识库</div>
    <el-scrollbar height="100%" max-height="70vh">
      <el-form class="create-lib" label-position="top">
        <div style="display: flex;align-items: stretch;">
          <el-form-item style="width: 50%;margin-right: 20px;">
            <template #label>
              <div style="display: flex;align-items: center;">
                <div class="mindcraft-flow-win-iconfont icon-mindcraft-xuanzeshangchuanwenjian"></div>
                <div class="form-text">选择文档</div>：<br><el-text class="form-tips" type="info">（当前支持txt, docx, 以及pdf格式）</el-text>
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
          <el-form-item style="width: 50%;">
            <template #label>
              <div style="display: flex;align-items: center;">
                <div class="mindcraft-flow-win-iconfont icon-mindcraft-shifougongxiang"></div>
                <div class="form-text">是否分享</div>：
              </div>
            </template>
            <el-switch size="large" v-model="editInfo.is_shared" inline-prompt active-text="分享" inactive-text="不分享"></el-switch>
          </el-form-item>
        </div>
        <el-form-item>
          <template #label>
            <div style="display: flex;align-items: center;">
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-zhishikuleixing"></div>
              <div class="form-text">知识库类型</div>：
            </div>
          </template>
          <el-select class="lib-input" v-model="editInfo.db_category" placeholder="选择文档分段方法">
            <el-option v-for="item in db_category_options" :key="item.value" :label="item.label"
              :value="item.value"/>
          </el-select>
        </el-form-item>
        <template v-if="editInfo.db_category === 'vector'">
          <div style="display: flex;align-items: stretch;">
            <el-form-item style="width: 50%;margin-right: 20px;">
              <template #label>
                <div style="display: flex;align-items: center;">
                  <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduanfangshi"></div>
                  <div class="form-text">文档分段方式</div>：
                </div>
              </template>
              <el-select class="lib-input" v-model="editInfo.file_splitter" placeholder="选择文档分段方法">
                <el-option v-for="item in filesplit_options" :key="item.filesplit_value" :label="item.filesplit_label"
                  :value="item.filesplit_value" :disabled="item.disabled" />
              </el-select>
            </el-form-item>
            <el-form-item style="width: 50%;">
              <template #label>
                <div style="display: flex;align-items: center;">
                  <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduandaxiao"></div>
                  <div class="form-text">分段大小</div>：
                </div>
              </template>
              <el-input-number class="lib-input" v-model="editInfo.chunk_size" :min="1" :max="5000"></el-input-number>
            </el-form-item>
          </div>
          <div style="display: flex;align-items: stretch;">
            <el-form-item style="width: 33%;margin-right: 20px;">
              <template #label>
                <div style="display: flex;align-items: center;">
                  <div class="mindcraft-flow-win-iconfont icon-mindcraft-moxing"></div>
                  <div class="form-text">Embedding模型</div>：
                </div>
              </template>
              <el-select class="lib-input" v-model="editInfo.embeddings" placeholder="选择Embedding模型">
                <el-option v-for="item in modelList" :key="item.id" :label="item.model_content"
                    :value="item.model_name" />
              </el-select>
            </el-form-item>
            <el-form-item style="width: 33%;margin-right: 20px;">
              <template #label>
                <div style="display: flex;align-items: center;">
                  <div class="mindcraft-flow-win-iconfont icon-mindcraft-xiangliangshujuku"></div>
                  <div class="form-text">向量数据库</div>：
                </div>
              </template>
              <el-select class="lib-input" v-model="editInfo.vector_db" placeholder="选择向量数据库" >
                <el-option v-for="item in vector_db_options" :key="item.vdb_value" :label="item.vdb_label"
                  :value="item.vdb_value" :disabled="item.disabled" />
              </el-select>
            </el-form-item>
            <el-form-item style="width: 33%;">
              <template #label>
                <div style="display: flex;align-items: center;">
                  <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduandaxiao"></div>
                  <div class="form-text">返回结果数量</div>：
                </div>
              </template>
              <el-input-number class="lib-input" v-model="editInfo.top_k" :min="1" :max="15"></el-input-number>
            </el-form-item>
          </div>
        </template>
        <el-form-item>
          <template #label>
            <div style="display: flex;align-items: center;">
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-mingcheng"></div>
              <div class="form-text">知识库名称</div>：
            </div>
          </template>
          <el-input class="lib-input" v-model="editInfo.index_name"></el-input>
        </el-form-item>
        <el-form-item style="min-height: 114px;">
          <template #label>
            <div style="display: flex;align-items: center;">
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-miaoshu"></div>
              <div class="form-text">知识库描述</div>：
            </div>
          </template>
          <el-input class="lib-input" v-model="editInfo.file_description" type="textarea" rows="4"></el-input>
        </el-form-item>
        <el-form-item style="min-height: 84px;">
          <template #label>
            <div style="display: flex;align-items: center;">
              <div class="mindcraft-flow-win-iconfont icon-mindcraft-shiyongzhinan"></div>
              <div class="form-text">使用指南</div>：
            </div>
          </template>
          <el-input class="lib-input" v-model="editInfo.file_desc" type="textarea" rows="4"></el-input>
        </el-form-item>
      </el-form>
    </el-scrollbar>

    <div style="margin-top: 20px;" class="btn-content">
      <el-button plain type="primary" @click="saveEdit">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-baocun"></div>保存</el-button>
      <el-button plain type="primary" @click="menuType = -1">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-back"></div>取消</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
const menuType = inject('menuType')

const editInfo = ref({
  is_shared:  false,
  db_category: "full_context",
  file_splitter: "by_code",
  chunk_size: 500,
  embeddings: "",
  vector_db: "faiss",
  top_k: "8",
  index_name: "",
  file_description: "",
  file_desc: "",
})

import { getLibraryList } from '@/api/mainActivity/Library';
const modelList = ref([])
const getModelList = async () => {
  // 我也不知道为什么要把模型列表丢到这个接口返回
  const libRes = await getLibraryList(1, 1, '', '');
  modelList.value = libRes?.data?.model_list || []
  editInfo.value.embeddings = modelList.value[0]?.model_name
}
getModelList()

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


import { addCreateLibrary } from '@/api/mainActivity/Library';
const saveEdit = async () => {
  if(!files.value.length){
    ElMessage.error("请上传文件");
    return;
  }
  if(!editInfo.value.index_name){
    ElMessage.error("请输入知识库名称");
    return;
  }
  if(!editInfo.value.file_splitter){
    ElMessage.error("文档分段方式");
    return;
  }
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
    await addCreateLibrary(libraryformData);
    // console.log(response.data.message);
    // 在这里执行编辑后的操作，例如刷新列表等
    //用elmessge提示编辑成功
    ElMessage.success("知识库创建成功");
    deleteClose();
  } catch (error) {
    ElMessage.error("知识库创建失败");
    console.log(error);
  }
  menuType.value = -1
}
</script>

<style lang="scss" scoped>
@import url("./lib.scss");
.create {
  width: 100%;
  max-width: 800px;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 20px;
  .create-lib{
    :deep(.el-form-item) {
      margin-bottom: 20px;
    }
    :deep(.el-form-item__label) {
      font-weight: bold;
      font-size: var(--el-font-size-base);
      color: var(--el-color-primary);;
      min-width: 120px;
      width: fit-content;
      justify-content: flex-start;
      line-height: 28px;
      white-space: nowrap;
      .mindcraft-flow-win-iconfont{
        font-size: 16px;
        color: var(--el-color-primary);
        margin-right: 6px;
      }
      .form-text{
        font-size: 16px;
      }
      .form-tips{
        font-weight: 400;
      }
    }
  }
}
</style>