<template>
  <el-form class="lib-form">
    <el-form-item>
      <template #label>
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-mingcheng"></div>
        <div class="form-text font-justify">名称</div>：
      </template>
      <el-text type="info">{{ libInfo.index_name }}</el-text>
    </el-form-item>
    <el-form-item>
      <template #label>
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-ID"></div>
        <div class="form-text font-justify">知识库ID</div>：
      </template>
      <el-text type="info">{{ libInfo.id }}</el-text>
    </el-form-item>
    <el-form-item style="min-height: 114px;">
      <template #label>
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-miaoshu"></div>
        <div class="form-text font-justify">描述</div>：
      </template>
      <el-text type="info">{{ libInfo.file_description }}</el-text>
    </el-form-item>
    <el-form-item style="min-height: 84px;">
      <template #label>
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-shiyongzhinan"></div>
        <div class="form-text font-justify">使用指南</div>：
      </template>
      <el-text type="info">{{ libInfo.file_desc }}</el-text>
    </el-form-item>
    <el-form-item>
      <template #label>
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-zhishikuleixing"></div>
        <div class="form-text font-justify">知识库类型</div>：
      </template>
      <el-text type="info">{{ libType(libInfo.db_category) }}</el-text>
    </el-form-item>
    <template v-if="libInfo.db_category === 'vector'">
      <div style="display: flex;align-items: stretch;justify-content: space-between;">
        <el-form-item style="width: 50%;margin-right: 12px;min-height: 0;">
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduanfangshi"></div>
            <div class="form-text">分段方式</div>：
          </template>
          <el-text type="info">{{ splitterType(libInfo.file_splitter) }}</el-text>
        </el-form-item>
        <el-form-item style="width: 50%;min-height: 0;">
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-fenduandaxiao"></div>
            <div class="form-text">分段大小</div>：
          </template>
          <el-text type="info">{{ libInfo.chunk_size }}</el-text>
        </el-form-item>
      </div>
      <el-form-item>
        <template #label>
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-moxing"></div>
          <div class="form-text">embedding模型</div>：
        </template>
        <el-text type="info">{{ libInfo.embeddings }}</el-text>
      </el-form-item>
      <el-form-item>
        <template #label>
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-xiangliangshujuku"></div>
          <div class="form-text">向量数据库</div>：
        </template>
        <el-text type="info">{{ libInfo.vector_db }}</el-text>
      </el-form-item>
      <div style="display: flex;align-items: stretch;justify-content: space-between;">
        <el-form-item style="width: 50%;margin-right: 12px;min-height: 0;">
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-guanzhushu1"></div>
            <div class="form-text">创建人</div>：
          </template>
          <el-text type="info">{{ libInfo.upload_user }}</el-text>
        </el-form-item>
        <el-form-item style="width: 50%;min-height: 0;">
          <template #label>
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-shifougongxiang"></div>
            <div class="form-text">是否分享</div>：
          </template>
          <el-text type="info">{{ libInfo.is_shared ? "是" : "否" }}</el-text>
        </el-form-item>
      </div>
    </template>
  </el-form>
</template>

<script setup>
const props = defineProps(["libInfo"])
const libType = (db_category) => {
  switch (db_category) {
    case "vector":
      return "向量分段";
    case "full_context":
      return "全文";
    default:
      return "";
  }
}

const splitterType = (file_splitter) => {
  switch (file_splitter) {
    case "by_code":
      return "标准分段";
    case "by_ai":
      return "智能分段";
    default:
      return "";
  }
}

</script>

<style lang="scss" scoped>

</style>