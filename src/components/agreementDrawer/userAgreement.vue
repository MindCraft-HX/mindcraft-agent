<template>
  <div>
    <el-dialog v-model="centerDialogAgreement" title="用户使用协议" width="1000" center>
      <div>
        <div>
          <div class="title">欢迎您使用MindCraft软件及服务！</div>
          <div class="content">
            本协议是您与深圳瀚象信息科技有限公司（以下简称“瀚象科技”）之间关于您使用MindCraft软件及服务所订立的协议。请您仔细阅读以下全部内容。您点击“同意”按钮并继续使用软件及服务，即表示您已阅读并同意本协议的约束。如果您不同意本协议的任何内容，或者无法准确理解瀚象科技对条款的解释，请不要进行后续操作。
          </div>
        </div>
        <div>
          <div class="title">1. 服务条款的确认和接纳</div>
          <div class="content">
            MindCraft的所有权和运营权归瀚象科技所有。用户同意所有注册协议条款并完成注册程序，才能成为MindCraft的正式用户。用户确认：本协议条款是处理双方权利义务的契约，始终有效，除非在法律允许的范围内瀚象科技取消这些服务，或者用户主动停止使用MindCraft的服务。
          </div>
        </div>
        <div>
          <div class="title">2. 服务内容</div>
          <div class="content">
            MindCraft服务的具体内容由瀚象科技根据实际情况提供，包括但不限于用户管理、AI办公辅助、数据分析、支付服务等。瀚象科技保留随时变更、中断或终止部分或全部MindCraft服务的权利。
          </div>
        </div>
        <div>
          <div class="title">3. 用户帐号</div>
          <div class="content">
            用户一旦注册成功，成为MindCraft的合法用户，将得到一个密码和帐号。用户需谨慎合理的保存、使用其帐号和密码。用户因密码泄露而造成的任何损失，由用户自行承担。
          </div>
        </div>
        <div>
          <div class="title">4. 用户声明与保证</div>
          <div class="content">
            用户承诺其为具有完全民事行为能力的自然人、法人或其他组织。用户在使用MindCraft时，必须遵循：
          </div>
          <ol class="content">
            <li>遵守中国有关的法律和法规。</li>
            <li>不得为任何非法目的而使用网络服务系统。</li>
            <li>遵守所有与网络服务有关的网络协议、规定和程序。</li>
            <li>不得利用MindCraft服务进行任何可能对互联网的正常运转造成不利影响的行为。</li>
            <li>不得利用MindCraft服务进行任何不利于瀚象科技的行为。</li>
          </ol>
        </div>
        <div>
          <div class="title">5. 隐私保护</div>
          <div class="content">
            保护用户隐私是瀚象科技的一项基本政策，瀚象科技保证不对外公开或向第三方提供单个用户的注册资料及用户在使用网络服务时存储在MindCraft中的非公开内容，但下列情况除外：
          </div>
          <ol class="content">
            <li>事先获得用户的明确授权；</li>
            <li>根据有关的法律法规要求；</li>
            <li>按照相关政府主管部门的要求；</li>
            <li>为维护社会公众的利益。</li>
          </ol>
        </div>
        <div>
          <div class="title">6. 支付服务声明</div>
          <div class="content" style="margin: 5px 0px;">
            1. <span
              style="font-weight: 600;">服务描述：</span>MindCraft软件提供的支付服务允许用户通过各种支付手段（如信用卡、借记卡、第三方支付平台等）进行商品或服务的购买。所有支付服务均需遵守本协议以及支付服务提供商的条款和政策。
          </div>
          <div class="content" style="margin: 5px 0px;">
            2. <span
              style="font-weight: 600;">支付安全：</span>用户理解并同意其支付行为的安全性取决于用户保护支付信息的能力。瀚象科技将采取合理措施保护用户的支付信息和交易安全，但不对因用户自身原因导致的支付信息泄露或其他安全问题负责。
          </div>
          <div class="content" style="margin: 5px 0px;">
            3. <span
              style="font-weight: 600;">退款政策：</span>用户在使用MindCraft软件进行支付时，应遵守本软件明确的退款政策。退款政策将根据提供的服务或商品的性质而有所不同，具体退款规则将在购买流程中明确或在特定服务条款中说明。
          </div>
          <div class="content" style="margin: 5px 0px;">
            4. <span
              style="font-weight: 600;">责任限制：</span>深圳瀚象信息科技有限公司不是支付处理机构或银行。对于支付过程中的任何失败、错误、未授权的交易、欺诈等情况，只要不是由瀚象科技的故意行为或重大过失导致，瀚象科技将不承担责任。
          </div>
          <div class="content" style="margin: 5px 0px;">
            5. <span
              style="font-weight: 600;">第三方支付服务：</span>5.如果用户选择通过第三方支付服务提供商进行支付，用户还需遵守该第三方的服务条款和政策。深圳瀚象信息科技有限公司不对第三方支付服务提供商的行为或服务质量负责。
          </div>
        </div>
        <div>
          <div class="title">7. 版权声明</div>
          <div class="content">
            MindCraft的所有版权、商标、专利、商业秘密及其他所有权利，均为瀚象科技所有。未经瀚象科技明确的书面同意，任何单位或个人不得以任何形式非法复制、传播、展示、镜像、上载、下载MindCraft。否则，瀚象科技将依法追究法律责任。
          </div>
        </div>
        <div>
          <div class="title">8. 法律管辖和适用</div>
          <div class="content">
            本协议的订立、执行和解释及争议的解决均应适用中国法律。如双方就本协议内容或其执行发生任何争议，双方应尽量友好协商解决；协商不成时，任何一方均可向瀚象科技所在地的人民法院提起诉讼。
          </div>
        </div>
        <div>
          <div class="title">9. 其他规定</div>
          <div class="content">
            本协议中的标题仅为方便而设，不影响对本条款的解释。本协议的任何条款被认定为无效或不可执行时，不影响其他条款的效力。
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="ClickAgreement">
            已阅读用户协议
          </el-button>
          <el-button @click="centerDialogAgreement = false">取消</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
<!-- overflow-y:auto; -->

<script setup>
import { ref } from "vue";
import { useMitt } from "../../utils/mitt";

const mitt = useMitt();

const centerDialogAgreement = ref(false);

const props = defineProps({
  registerForm: {
    type: Object,
  },
  numberValidateForm: {
    type: Object,
  },
  wechatGather: {
    type: Object,
  }
});


mitt.on("centerDialogAgreement", () => {
  centerDialogAgreement.value = true;
});


const ClickAgreement = () => {
  if (props.registerForm) {
    props.registerForm.agreement = true;
  }
  if (props.numberValidateForm) {
    props.numberValidateForm.userAgreement = true;
  }
  if (props.wechatGather) {
    props.wechatGather.agreement = true;
  }
  centerDialogAgreement.value = false;
}

defineExpose({
  centerDialogAgreement
});


</script>

<style scoped>
.title {
  font-size: 20px;
  font-weight: 600;
  margin: 8px 0px;
  color: #000;
}

.content {
  font-size: 16px;
  color: #000;
}

:deep(.el-dialog__title) {
  font-weight: 600;
}
</style>
