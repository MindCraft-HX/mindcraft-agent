<template>
  <div>
    <el-button
      type="primary"
      style="margin-top: 2px"
      @click="clickDrawer()"
      :class="buttonClass"
    >
    </el-button>
    <el-drawer
      size="initial"
      v-model="pointCardDrawer"
      title="会员积分"
      @close="closePointCardDrawer"
    >
      <div ref="content">
        <el-tabs ref="tabs" type="card" v-model="activeTab" class="tool-tabs">
          <el-tab-pane label="积分余额" name="pointBalance">
            <pointBalance />
          </el-tab-pane>
          <el-tab-pane label="积分明细" name="IntegralDetail">
            <IntegralDetail />
          </el-tab-pane>
          <el-tab-pane label="积分充值" name="pointRecharge">
            <pointRecharge />
          </el-tab-pane>
          <el-tab-pane label="计费详情" name="stowageDetails">
            <stowageDetails />
          </el-tab-pane>
          <el-tab-pane label="分享计划" name="inviteList">
            <inviteList />
          </el-tab-pane>
          <!-- <el-tab-pane label="分享" name="pppp">
            <sharePoints />
          </el-tab-pane> -->
        </el-tabs>
        <!-- <div class="return">
                    <el-button type="primary" plain size="small">返回</el-button>
                </div> -->
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed } from "vue";
import pointBalance from "./components/pointBalance.vue";
import IntegralDetail from "./components/IntegralDetail.vue";
import pointRecharge from "./pointRecharge/index.vue";
import sharePoints from "./components/sharePoints.vue";
import stowageDetails from './components/stowageDetails.vue';
import inviteList from './components/inviteList.vue';
import { useMitt } from "../../utils/mitt";
import { userVipTypeStore } from "../../stores/vipType";

const mitt = useMitt();
const vipTypeStore = userVipTypeStore();

const pointCardDrawer = ref(false);
const activeTab = ref("pointBalance");

const buttonClass = computed(() => {
  const vip_level = vipTypeStore.vip_level; //vip
  // 检查vip_level的值，返回相应的类名
  if (vip_level == "0" || vip_level == null) {
    return "VIP-image";
  } else if (vip_level >= "0") {
    return "VIP-image2";
  }
});

// 打开弹窗
const clickDrawer = (type) => {
  activeTab.value = type || "pointBalance";
  // 掉过来渲染
  mitt.emit("IntegralDetailLIst");
  mitt.emit("fetchDataAndRenderChart");
  mitt.emit("handleResize");
  mitt.emit("userPermission");
  mitt.emit("getShareList");
  pointCardDrawer.value = true;
};
mitt.on("clickDrawer", (type) => {
  clickDrawer(type);
});

// const clickpointBalance = (Event)=>{
//   if(Event.uid == 565){
//       mitt.emit('handleResize');
//   }
//   mitt.emit('handleDispose');
// }

const closePointCardDrawer = () => {
  mitt.emit("handleDispose");
};
</script>

<style scoped>
.tool-tabs {
  position: relative;
}

:deep(.el-drawer__title) {
  color: #000000;
  font-weight: 600;
}

.return {
  position: absolute;
  top: 100px;
  right: 30px;
}

.VIP-image {
  width: 56px;
  height: 26px;
  background-image: url(../../assets/VIP1.png);
  background-size: 100% 100%;
}

.VIP-image2 {
  width: 56px;
  height: 26px;
  background-image: url(../../assets/VIP2.png);
  background-size: 100% 100%;
}
</style>
