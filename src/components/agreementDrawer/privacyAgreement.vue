<template>
  <div>
    <el-dialog v-model="privacyDialogAgreement" title="用户隐私协议" width="1000" center>
      <div class="Title_hear">
        <div style="display: flex;justify-content: center;">（包含儿童隐私政策）</div>

        <div style="font-weight: 600;">
          &nbsp&nbsp&nbsp&nbsp温馨提示：请您认真阅读并充分理解《用户隐私协议》《儿童隐私政策》（以下统称《协议》）的全部内容，特别是总则、知识产权、免除或者限制深圳瀚象信息科技有限公司（以下简称“瀚象信息”）责任的条款、对用户的权利限制条款、争议解决和法律适用条款。
        </div>
        <div>
          &nbsp&nbsp&nbsp&nbsp请您在认真阅读并充分理解《协议》内容之后决定是否同意《协议》。如您是未满18周岁的未成年人，或您因其他原因不具有完全民事行为能力，须在法定监护人陪同下，进行阅读并决定是否同意《协议》，请特别注意儿童隐私政策。您和您的法定监护人均受本协议条款的约束，并对瀚象信息账号和服务的使用负责。
        </div>

        <div>&nbsp&nbsp&nbsp&nbsp您同意《协议》全部内容之后，即可注册、登录或使用《协议》所涉相关产品及服务。<a
            style="color: #000;font-weight: 600;text-decoration: underline;">
            您的注册、登录、访问或以其他方式使用产品及服务等行为视为对《协议》全部内容的接受，</a>《协议》即产生法律效力。</div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp儿童隐私政策特别说明：</div>
        <div style="font-weight: 600;">
          &nbsp&nbsp&nbsp&nbsp如果您是未满14周岁的儿童，请您务必通知您的法定监护人仔细阅读本规则，并在征得您的监护人同意后，使用瀚象信息产品及服务。如您是儿童法定监护人，请您仔细阅读和选择是否同意本协议。请您与瀚象信息共同保护儿童的个人信息，教育引导儿童增强个人信息保护意识和能力。
        </div>
        <div style="color: blue;">&nbsp&nbsp&nbsp&nbsp本协议适用范围包括：瀚象信息网站 <span style="text-decoration: underline;"><a
              href="https://www.mindcraft.com.cn" style="color: blue;"> （www.mindcraft.com.cn）</a>、MindCraft</span>
          AI应用软件、“MindCraft AI”微信公众号（以下统称“瀚象信息”）。</div>
        <div>&nbsp&nbsp&nbsp&nbsp一、总则（特别注意）</div>
        <div>&nbsp&nbsp&nbsp&nbsp1、瀚象信息若获悉您不满十四周岁，将本协议自动升级为儿童隐私政策，会采取特殊措施保护儿童的个人信息。本协议项下的用户及“您”，泛指儿童及其法定监护人。</div>
        <div>
          &nbsp&nbsp&nbsp&nbsp2、您充分理解并同意，本协议是您和您的法定监护人（若有）与瀚象信息之间就瀚象信息产品服务等相关事宜所订立的约定，您和您的法定监护人（若有）承诺接受并遵守《协议》的约定，届时您和您的法定监护人（若有）不应以未阅读《协议》的内容或者未获得瀚象信息对您疑问的解答等理由，主张《协议》无效或可撤销。
        </div>
        <div>
          &nbsp&nbsp&nbsp&nbsp3、您充分理解并同意，《协议》可由瀚象信息随时更新，更新后的协议条款一经正式发布，即代替旧协议条款，不再另行通知及签署，您和您的法定监护人（若有）可在瀚象信息查阅最新版协议条款。在瀚象信息修改本协议条款后，如果您和您的法定监护人（若有）不接受修改后的条款，请您和您的法定监护人（若有）立即停止使用本产品及服务，您和您的法定监护人（若有）继续使用的行为，将被视为已同意了修改后的协议。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp4、您充分理解并同意，瀚象信息可以不断发布关于本产品或服务的其他协议、规则、制度等内容。上述内容一经正式发布，即为本《协议》不可分割的组成部分，具有同等的法律效力。
        </div>
        <div>
          &nbsp&nbsp&nbsp&nbsp5、您充分理解并同意，为了更好地向您提供服务，瀚象信息会不断优化、升级服务，若该功能或服务未在本隐私协议中进行说明，但需要收集、使用、转让、共享和公开披露您的个人信息的，我们会通过页面提示、交互流程、系统通知等方式另行向您说明，您的继续使用行为，视为您明示授权。
        </div>
        <div>
          &nbsp&nbsp&nbsp&nbsp6、您充分理解并同意，在不透露个人信息的前提下，瀚象信息可以对整个用户数据库进行分析，并对用户数据库进行商业上的利用，包括但不限于公布、分析或以其他方式使用用户访问量、访问时段、用户偏好等用户数据信息。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp7、您充分理解并同意，同意本协议，就是明示授权瀚象信息在相关法律法规及本协议约定情况下，有权收集、使用、转让、共享和公开披露您的个人信息及个人敏感信息，相关定义如下：
        </div>
        <div>
          &nbsp&nbsp&nbsp&nbsp（1）个人信息：指以电子或者其他方式记录的能够单独或者与其他信息结合识别特定自然人身份或者反映特定自然人活动情况的各种信息，包括姓名、身份证件号码、通信通讯联系方式、住址、账号密码、财产状况、行踪轨迹等。
        </div>
        <div>
          &nbsp&nbsp&nbsp&nbsp（2）个人敏感信息：指一旦泄露、非法提供或滥用可能危害人身和财产安全，极易导致个人名誉、身心健康受到损害或歧视性待遇等的个人信息。通常情况下，14岁以下（含）儿童的个人信息和自然人的隐私信息属于个人敏感信息。（参见《GBT
          35273-2017 信息安全技术个人信息安全规范》）</div>
        <div>
          &nbsp&nbsp&nbsp&nbsp（3）个人信息处理：您在注册、登录和使用瀚象信息时，瀚象信息会收集、使用、保存、共享您的相关个人信息；可能会调取您的摄像头、麦克风、存储、通讯录等权限；受第三方（学校或教育机构）委托，收集、处理您的部分个人信息。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp（4）个人信息删除：指为实现产品及服务功能，去除个人信息，使个人信息保持不可被检索、访问的状态的行为。</div>
        <div>&nbsp&nbsp&nbsp&nbsp二、用户权利与义务</div>
        <div>&nbsp&nbsp&nbsp&nbsp1、您充分理解并同意，提供的个人信息均具有真实性、准确性，有效性。如个人信息发生变动，应及时进行更新。如因前述原因导致您本人或第三人受到损害，瀚象信息不承担责任。</div>
        <div>&nbsp&nbsp&nbsp&nbsp2、您充分理解并同意，根据相关法律法规规定，以下情形中收集儿童/未成年人/用户的信息无需征得本人和/或法定监护人的授权同意：</div>
        <div>&nbsp&nbsp&nbsp&nbsp（1）与我们和/或委托我们的个人信息控制者履行法律法规规定的义务相关的；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（2）与国家安全、国防安全直接相关的；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（3）与公共安全、公共卫生、重大公共利益直接相关的；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（4）与刑事侦查、起诉、审判和判决执行等直</div>
        <div>&nbsp&nbsp&nbsp&nbsp（5）出于维护个人信息主体或其他个人的生命、财产等重大合法权益但又很难得到儿童监护人授权同意的；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（6）所涉及的儿童个人信息是您作为其监护人向社会公众公开的；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（7）根据您的要求签订和履行合同所必需的；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（8）从合法公开披露的信息中收集个人信息的，如合法的新闻报道、政府信息公开等渠道；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（9）维护所提供产品或服务的安全稳定运行所必需的，例如发现、处置产品或服务的故障；</div>
        <div>&nbsp&nbsp&nbsp&nbsp（10）委托我们的个人信息控制者为学术研究机构，出于公共利益开展统计或学术研究所必要，且其对外提供学术研究或描述的结果时，对结果中所包含的个人信息进行去标识化处理的。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp 超出本协议及相关法律法规以外的儿童/未成年个人信息的收集、共享、转让、储存等行为，瀚象信息会事先征得法定监护人的同意。</div>
        <div>&nbsp&nbsp&nbsp&nbsp 3、您和您的法定监护人（若有）违反本协议，瀚象信息在不需通知您的情况下，有权拒绝提供服务、关闭个人账号、清除或编辑内容、取消订单、删除各类不符合法律规定或不真实信息内容。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp三、瀚象信息权利与义务</div>
        <div>&nbsp&nbsp&nbsp&nbsp
          1、瀚象信息严格按照《中华人民共和国网络安全法》《个人信息安全规范》等相关法律法规及本协议约定收集、使用、共享、转让、公开披露、管理和保障您的个人信息，本协议对个人信息保护相关内容未作明确约定的，以相关法律法规约定为准。
        </div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp
          除因瀚象信息存在主观过错外，您自行承担使用瀚象信息产品及服务产生的风险。如因本人过错或行为而遭受损失或由第三人造成您损失的，应当依法向侵权人追究法律责任，瀚象信息不承担任何责任。</div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp
          2、瀚象信息有权收集、使用、共享、转让、公开披露、管理和保障您的个人信息：在您注册、使用、访问瀚象信息时，为实现全部或部分功能，瀚象信息会进行个人信息处理，包括但不限于：</div>
        <div>&nbsp&nbsp&nbsp&nbsp
          （1）账号注册过程中，收集您的手机号码、密码、年龄段，以便于区分您本人直接注册或法定监护人代为注册瀚象信息账号。您充分理解并同意，第三方在经过您和您的法定监护人（若有）同意的情况下，可以通过向瀚象信息提交您的手机号码，代表您注册瀚象信息账号。在未经您同意的情况下，您可以自行注销账号。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp
          （2）资料完善过程中，您可以根据实际情况，选择提供昵称、头像、性别、生日、地区、签名等个人信息。如果您选择不提供，不会影响您正常地使用产品及服务。您充分理解并同意，您的个人信息会向您的联系人公开。</div>
        <div>&nbsp&nbsp&nbsp&nbsp
          （3）使用产品及服务过程中，根据产品及服务内容，瀚象信息可能调用摄像头、麦克风等权限，您可以在瀚象信息的“隐私设置”界面关闭上述权限，但您将无法正常使用部分功能。您充分理解并同意，我们将仅在摄像头启用的状态下采集您拍摄或选择的视频画面范围；将仅在麦克风启用的状态下采集您提供的语音信息。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp
          3、瀚象信息保障管理用户个人信息，特别涉及儿童/未成年人个人信息。您可以要求修改、删除或拒绝允许进一步收集、使用、储存和分享上述信息，但删除上述信息的请求可能会限制访问所有或部分功能、服务。如您认为瀚象信息未经您同意而收集、使用儿童/未成年人信息的，请尽快通知瀚象信息，瀚象信息在接到通知后，会在合理期限内尽快删除相关信息。
        </div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp 4、瀚象信息若使用合作第三方为用户提供服务，您在此同意并授权瀚象信息将您个人信息提供给第三方。</div>
        <div>&nbsp&nbsp&nbsp&nbsp
          5、除根据第三方相关协议约定，我们不会主动从其他第三方获取您的个人信息。如未来因业务发展或其他原因需要从第三方间接获取您的个人信息，我们会通过隐私协议或其他方式向您进行说明；我们也会遵守相关法律法规规定，要求第三方保障个人信息安全。
        </div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp
          6、您充分理解并同意，为向您提供更符合您需求的服务内容，瀚象信息会收集和使用您在访问或使用瀚象信息时的浏览、搜索、购买等信息，提取您的偏好特征，瀚象信息会将这些特征进行数据分析以生成间接用户画像，用于向您提供更加个性化的服务，包括向您展示、推送您可能感兴趣的内容，包括但不限于向您发出产品和服务信息，或向您展示个性化学习内容。
        </div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp 四、免责声明（特别注意）</div>
        <div>&nbsp&nbsp&nbsp&nbsp
          1、瀚象信息将会尽全力保障您在瀚象信息及服务中的数据存储安全，但是，瀚象信息不能保证您的个人信息不会受到任何侵害。瀚象信息不对您在瀚象信息及服务中相关数据的删除或储存失败负责，您可根据自身需求自行备份瀚象信息及服务中的相关数据。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp
          2、瀚象信息提供的个人信息保护措施仅适用于瀚象信息产品及服务。一旦您离开瀚象信息，浏览或使用其他网站、服务及内容资源，瀚象信息没有能力及义务保护您的任何个人信息，无论您登录、浏览或使用上述软件、网站是否基于瀚象信息的链接或引导。上述风险，瀚象信息不承担任何责任。
        </div>
        <div>&nbsp&nbsp&nbsp&nbsp
          3、在使用本服务的过程中，可能会遇到不可抗力、技术风险等因素，使本服务发生中断，对于下述原因导致的协议内容变更、数据丢失等情形，瀚象信息在法律允许的最大范围内免责。非因瀚象信息故意或过失行为，瀚象信息不承担任何责任，包括但不限于由于您将用户密码告知他人，由此导致的任何个人信息泄露。
        </div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp 五、争议解决（特别注意）</div>
        <div>&nbsp&nbsp&nbsp&nbsp 1、如本协议中的任何条款，无论因何种原因完全或部分无效或不具有执行力，不影响其他条款的效力。</div>
        <div>&nbsp&nbsp&nbsp&nbsp 2、本协议根据现行网络服务、在线平台的使用习惯制定而成，瀚象信息对本协议拥有最终解释权。</div>
        <div>&nbsp&nbsp&nbsp&nbsp 3、本协议受中国法律管辖，任何争议仅适用中华人民共和国法律。</div>
        <div>&nbsp&nbsp&nbsp&nbsp 4、如本协议因本协议发生的争议，应友好协商解决。协商不能解决的，任何一方均可向瀚象信息住所地人民法院提起诉讼。</div>
        <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp 六、 联系方式</div>
        <div>&nbsp&nbsp&nbsp&nbsp 当您有意见、建议或发现任何人违反本协议约定或以其他不当的方式使用您的个人信息，请立即向瀚象信息反馈、举报或投诉，瀚象信息将依本协议约定进行处理。</div>
        <div>&nbsp&nbsp&nbsp&nbsp 电子邮箱： <span style="color: blue;">sales@genitop.com </span></div>
        <div style="margin-top: 40px">&nbsp&nbsp&nbsp&nbsp 深圳瀚象信息科技有限公司 版权所有</div>
        <div style="color: blue;">&nbsp&nbsp&nbsp&nbsp 粤ICP备2024235734号-1</div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="ClickAgreement">
            已阅读用户协议
          </el-button>
          <el-button @click="privacyDialogAgreement = false">取消</el-button>
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

const privacyDialogAgreement = ref(false);

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


mitt.on("privacyDialogAgreement", () => {
  privacyDialogAgreement.value = true;
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
  privacyDialogAgreement.value = false;
}

defineExpose({
  privacyDialogAgreement
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

.Title_hear>div {
  font-size: 18px;
  color: #000;
}
</style>