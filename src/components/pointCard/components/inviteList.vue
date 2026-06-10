<template>
  <div class="share-plan">
    <el-card shadow="none" style="max-width: 40vw">
      <template #header>
        <el-radio-group v-model="cardType" size="large">
          <el-radio-button label="创建分享链接" value="share" />
          <el-radio-button label="分享记录查看" value="list" />
        </el-radio-group>
      </template>
      <template v-if="cardType === 'share'">
        <div class="share-box">
          <el-text size="large">分享链接获积分，每注册用户送<el-text type="primary">2000</el-text>积分</el-text>
          <el-popover placement="bottom-start" width="fit-content" trigger="click">
            <template #reference>
              <el-button type="primary" plain size="large">创建网页分享链接</el-button>
            </template>
            <el-link :href="shareInfo.shareLink" v-if="shareInfo?.shareLink">{{ shareInfo.shareLink
            }}</el-link>
            <el-button link type="primary" icon="copy-document" v-if="shareInfo?.shareLink"
              @click="copyLink"></el-button>
          </el-popover>
          <el-popover placement="bottom" width="fit-content" trigger="click">
            <template #reference>
              <el-button type="success" plain size="large">创建微信分享链接</el-button>
            </template>
            <div style="display: flex;flex-direction: column;align-items: center;justify-content: center;">
              <el-text size="large">微信扫一扫</el-text>
              <canvas class="qr-code" ref="qrcode"></canvas>
            </div>
          </el-popover>
        </div>
      </template>
      <template v-else>
        <el-form :inline="true">
          <el-form-item label="总人数">
            <el-text type="primary" size="large">{{ total }}</el-text>
          </el-form-item>
          <el-form-item label="总收入">
            <el-text type="primary" size="large">{{ total * 2000 }}</el-text> 积分
          </el-form-item>
        </el-form>
        <div class="share-list">
          <el-table :data="shareList" height="540">
            <el-table-column prop="user_name" label="用户名" />
            <el-table-column prop="to_use_platform" label="用户来源" />
            <el-table-column prop="to_use_time" label="激活时间" />
          </el-table>
          <!-- 分页 -->
          <div style="padding: 10px 10px">
              <el-pagination v-model:current-page="page" background v-model:page-size="size"
                  :page-sizes="[8, 15, 30, 50]" :small="true" layout=" sizes, prev, pager, next, jumper,->,total"
                  :total="total" @size-change="handleSizeChange" @current-change="handleCurrentChange" />
          </div>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from "vue";

import { postShareObject } from "@/api/mainActivity/share.js"
const shareInfo = ref({})
const getShareInfo = async () => {
  postShareObject({ share_type: 'share_code', share_obj_name: '用户邀请码' })
    .then(res => {
      shareInfo.value = res.data
      shareInfo.value.shareLink = `https://www.mindcraft.com.cn/miniprogram/share?shareCode=${shareInfo.value.id}`
      nextTick(() => {
        qrCode(shareInfo.value.shareLink);
      })
    })
}
import { ElMessage } from "element-plus";
const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(shareInfo.value.shareLink);
    ElMessage("已复制到剪贴板");
  } catch (error) {
    console.error("复制失败:", error);
  }
}
import QRCode from "qrcode";
const qrcode = ref(null); //插件qrcode实例
const qrCode = (url) => {
  nextTick(() => {
    QRCode.toCanvas(
      qrcode.value,
      url,
      {
        width: 200,
        height: 200,
      },
      function (error) {
        if (error) console.error(error);
        else console.log("二维码生成成功！");
      }
    );
  });
};

import { getShareUserCode } from "@/api/mainActivity/share.js"
const shareList = ref([])
const page = ref(1);
const size = ref(8);
const total = ref(0);
const getShareList = async () => {
  getShareUserCode({
    page: page.value,
    size: size.value
  })
    .then(res => {
      console.log(res)
      shareList.value = res?.data?.results || []
      total.value = res?.data?.count || 0
    })
}

const handleCurrentChange = (val) => {
  page.value = val;  // 更新当前页
  getShareList();  // 获取新页面数据
};
const handleSizeChange = (val) => {
  size.value = val;  // 更新每页显示条数
  getShareList();  // 重新获取数据
};

const cardType = ref("share")
watch(() => cardType.value, (val) => {
  if (val === "share") {
    getShareInfo()
  } else if (val == "list") {
    getShareList()
  }
}, {
  immediate: true
})
</script>

<style lang="scss" scoped>
.share-plan {
  flex: 1;
  padding: 24px;
  overflow: auto;

  .share-box {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;

    .el-text {
      width: 100%;
    }

    .el-button {
      margin: 12px 0;
    }
  }

  .qr-code {
    border: 1px solid #e4e7ed;
    border-radius: 12px;
    margin-top: 12px;
  }

  .share-list {
    flex-wrap: wrap;
  }

  .box-card {
    min-width: 20%;
    margin: 12px;
  }

  .none-more {
    margin: 12px auto;
    font-size: 16px;
  }
}
</style>