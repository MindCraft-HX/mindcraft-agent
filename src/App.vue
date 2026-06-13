<template>
  <el-config-provider :locale="elLocale">
    <div class="common-layout">
      <router-view :router="router" />
    </div>
  </el-config-provider>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const router = useRouter();
const { locale } = useI18n()
const elLocale = computed(() => locale.value === 'zh' ? zhCn : en)
</script>

<style lang="scss">
@import url("@/styles/toolPanel.scss");
body{
  margin: 0;
  padding: 0;
}
.common-layout {
  color: #333;
  height: 100vh;
}
.el-header,
.el-footer {
  text-align: center;
  /* line-height: 60px; */
  /* 阴影效果 */
  box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.26);
  /* 天蓝色*/
  background-color: #409eff;
}

/* .el-aside {
    background-color: #f5faff;
    text-align: center;
    padding-top: 10px;
    padding-bottom: 10px;
  } */

.el-main {
  background-color: #f6fbff;
  /* padding: 10px !important; */
}
.icon {
   width: 1em; height: 1em;
   vertical-align: -0.15em;
   fill: currentColor;
   overflow: hidden;
}
.lib-dialog{
  padding: 38px;
  border-radius: 16px 16px 16px 16px;
  .el-dialog__header{
    border-bottom: 1px solid #ABAAAA;
    margin-bottom: 20px;
  }
  .el-dialog__body{
    max-height: 60vh;
    overflow: auto;
  }
}
.mermaid{
  overflow: auto;
  svg{
    width: fit-content;
  }
}
</style>
