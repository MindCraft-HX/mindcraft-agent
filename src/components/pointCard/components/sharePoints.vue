<template>
  <!-- <div
        style="display: flex;justify-content: center;justify-content: center;align-items: center;flex-direction: column;margin-top: 20px;">
        <div class="head">
            <div style="font-size: 46px;color: #429EFA;font-weight: 600;">—&nbsp邀请码兑换&nbsp—</div>
            <div>
                <el-input v-model="input" style="    width: 500px;height: 50px;" placeholder="填入好友给你的邀请码" />
                <div style="margin-top: 5px;color: #26282D">输入专属邀请码，可获得1000积分，仅一次有效，不可重复获得奖励</div>
            </div>
            <el-button type="primary" style="width: 220px;height: 40px;">提交</el-button>
        </div>
        <div class="footer">
            <div style="width: 363px;height: 66px;color: #26282D;text-align: left;">
                首次分享，即可独享3500积分大礼!之后每次分享，再得1000积分，分析机会多达10次，超过10次不再获得积分奖励！快来与好友共享这份惊喜吧！</div>
            <div style="    display: flex;flex-direction: column;align-items: center;">
                <div class="fjImg" style="width: 66px;height: 63px;border-radius: 50% 50%;"></div>
                <div style="color:#499EF6;">已分享0次</div>
            </div>
        </div>
    </div> -->
  <div style="display: flex; justify-content: center; margin-top: 20px">
    <div
      class="head-img"
      style="
        width: 628px;
        height: 600px;
        display: flex;
        flex-direction: column;
        align-items: center;
      "
    >
      <!-- 上面 -->
      <div>
        <div
          style="
            font-size: 46px;
            color: #429efa;
            font-weight: 600;
            margin: 30px 30px;
          "
        >
          —&nbsp邀请码兑换&nbsp—
        </div>
        <div>
          <el-input
            v-model="value"
            style="width: 500px; height: 50px; margin: 10px 20px"
            placeholder="填入好友给你的邀请码"
          />
          <div style="margin-top: 5px; color: #26282d">
            输入专属邀请码，可获得1000积分，仅一次有效，不可重复获得奖励
          </div>
        </div>
        <el-button
          type="primary"
          style="width: 220px; height: 40px; margin: 90px 50px"
          @click="ShareCodeSubmission"
          >提交</el-button
        >
      </div>
      <!-- 下面 -->
      <div style="width: 558px; height: 150px">
        <div
          style="
            display: flex;
            justify-content: space-around;
            align-items: center;
            height: 100%;
            margin-left: -30px;
          "
        >
          <div
            style="width: 363px; height: 66px; color: #26282d; text-align: left"
          >
            首次分享，即可独享3500积分大礼!之后每次分享，再得1000积分，分析机会多达10次，超过10次不再获得积分奖励！快来与好友共享这份惊喜吧！
          </div>
          <div
            style="display: flex; flex-direction: column; align-items: center"
          >
            <div
              class="fjImg"
              style="width: 66px; height: 63px; border-radius: 50% 50%"
            ></div>
            <div style="color: #499ef6">已分享0次</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from "vue";
import {
  postSharePoints,
  getSharePoints,
} from "../../../api/mainActivity/pointCard/sharePoints";

const value = ref("");

// 提交
const ShareCodeSubmission = () => {
  console.log(value, "value");
};

// 分享
</script>

<style scoped>
.head {
  width: 640px;
  height: 400px;
  background: #ebf5ff;
  border: 1px solid #c8c8c8;
  margin-bottom: 1px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
}

.footer {
  width: 640px;
  height: 172px;
  background: #ebf5ff;
  border: 1px solid #c8c8c8;
  border-radius: 10px;
  display: flex;
  justify-content: space-around;
  align-items: center;
}

:deep(.el-input__inner) {
  text-align: center;
  font-size: 18px;
}

.fjImg {
  background-image: url(../../../assets/fx.png);
  background-size: 100% 100%;
}

.head-img {
  background-image: url(../../../assets/share-bj.png);
  background-size: 100% 100%;
}
</style>
