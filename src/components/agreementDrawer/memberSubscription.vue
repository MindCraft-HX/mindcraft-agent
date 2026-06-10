<template>
    <div>
      <el-dialog
        v-model="memberSubscriptionShow"
        title="网络会员订阅服务协议"
        width="1000"
        center
        @closed="closeMemberSubscription"
      >
      <div class="Title_hear">
         
           <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp温馨提示：请您认真阅读并充分理解《用户隐私协议》《儿童隐私政策》（以下统称《协议》）的全部内容，特别是总则、知识产权、免除或者限制深圳瀚象信息科技有限公司（以下简称“瀚象信息”）责任的条款、对用户的权利限制条款、争议解决和法律适用条款。</div>
           <div>&nbsp&nbsp&nbsp&nbsp请您在认真阅读并充分理解《协议》内容之后决定是否同意《协议》。如您是未满18周岁的未成年人，或您因其他原因不具有完全民事行为能力，须在法定监护人陪同下，进行阅读并决定是否同意《协议》，请特别注意儿童隐私政策。<span style="font-weight: 600;">您和您的法定监护人均受本协议条款的约束，并对瀚象信息账号和服务的使用负责。</span> </div>



           <div>&nbsp&nbsp&nbsp&nbsp您同意《协议》全部内容之后，即可注册、登录或使用《协议》所涉相关产品及服务。<span style="font-weight: 600;text-decoration: underline;"> 您的注册、登录、访问或以其他方式使用产品及服务等行为视为对《协议》全部内容的接受，</span>《协议》即产生法律约束力。</div>
           <div>&nbsp&nbsp&nbsp&nbsp本协议适用范围包括MindCraft AI应用软件，具体指：MindCraft AI网站 <span style="color: blue;text-decoration: underline;"> <a href="https://www.mindcraft.com.cn" style="color: blue;" >（https://www.mindcraft.com.cn）</a>、“MindCraft </span> AI” APP（以下统称“MindCraft AI”）。 MindCraft AI服务，包含多模态的AI交互，以MindCraft AI实际提供为准。</div>
           <div>&nbsp&nbsp&nbsp&nbsp一、总则（特别注意）</div>
           <div>&nbsp&nbsp&nbsp&nbsp1、本服务协议双方为瀚象信息与MindCraft AI注册用户，用于规范双方之间有关MindCraft AI应用内会员订阅服务（以下简称“会员订阅服务”）的全部法律关系及权利义务。</div>
           <div>&nbsp&nbsp&nbsp&nbsp2、协议条款的确认和接纳瀚象信息的会员订阅服务的所有权和运作权归属瀚象。瀚象信息提供的会员订阅服务将按照其发布的协议条款和使用规则严格执行。用户必须完全同意所有协议条款并已完成成为MindCraft AI用户的注册程序，才能获赠或使用会员订阅服务。 用户一旦开始使用会员订阅服务，则自动显示其完全同意本协议的所有条款并接受本协议的制约。</div>
           <div>&nbsp&nbsp&nbsp&nbsp3、协议条款的修改瀚象信息有权在不通知用户的情况下随时对会员订阅服务协议条款进行修改或补充。条款一旦发生变动，将对所有用户及其会员订阅服务发生效力，而不论用户何时注册及会员订阅服务何时获赠。如果用户不接受变动后的条款，用户同意停止使用会员订阅服务并放弃对其帐户里已有会员订阅服务的任何权利，瀚象有权立即停止该用户使用会员订阅服务并废除其帐户里的会员订阅服务。用户如继续使用会员订阅服务，则自动显示其完全同意变动后的条款并接受所有服务条款的制约。</div>
           <div>&nbsp&nbsp&nbsp&nbsp4、瀚象信息所有发给用户的通告都可通过重要页面的公告或电子邮件传送。服务条款的修改、服务变更、或其它重要事件的通告均可以上述形式进行。</div>
           <div>&nbsp&nbsp&nbsp&nbsp5、瀚象信息对用户帐户里的会员订阅服务拥有最终及绝对的解释权和决定权。</div>
           <div>&nbsp&nbsp&nbsp&nbsp二、会员订阅服务</div>
           <div>&nbsp&nbsp&nbsp&nbsp1、会员订阅服务赠送</div>
           <div>&nbsp&nbsp&nbsp&nbsp（1）积分服务将于北京时间公元_2024_年__5__月_10_日零时开始，此时间简称 "开始时间"。</div>
           <div>&nbsp&nbsp&nbsp&nbsp（2）"开始时间"后所有注册为MindCraft AI会员并且经瀚象信息核实维持有效用户和密码的用户将一次性获赠一个月的会员订阅服务；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（3）只有在MindCraft AI进行网上交易并以注册用户的身份交易方可能获赠会员订阅服务，"网上交易"定义为通过互联网向MindCraft AI网站或应用提交订单的交易，不包括线下等其它交易方式。"以注册用户的身份交易"定义为在"MindCraft AI网站或应用"下已完成用户登录后以注册用户名进行的交易。</div>
           <div>&nbsp&nbsp&nbsp&nbsp（4）注册账号赠送一个月的会员订阅服务的赠送并非永久性。将根据瀚象信息的推广政策而变更。</div>
           <div>&nbsp&nbsp&nbsp&nbsp2、会员订阅服务的使用规则</div>
           <div>&nbsp&nbsp&nbsp&nbsp（1）只有在MindCraft AI进行网上或应用内交易并以注册用户的身份交易方可使用会员订阅额服务。</div>
           <div>&nbsp&nbsp&nbsp&nbsp（2）在前一条款的条件下MindCraft AI用户的会员订阅服务有效期时间不设上限，只要会员订阅服务在有效期就可以一直生效。</div>
           <div>&nbsp&nbsp&nbsp&nbsp（3）用户每次的会员订阅服务必须于瀚象信息确认已收到用户支付的款项后才正式划到用户名下。</div>
           <div>&nbsp&nbsp&nbsp&nbsp（4）如发生用户退费的情况，则取消用户的会员订阅服务，消耗的积分从用户的积分总额和可使用积分总额中扣除。</div>
           <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp（5）用户帐户里的会员订阅服务只可在MindCraft AI上使用，瀚象信息无责任或义务将用户帐户里的积分兑换为现金、或有价证券，并且瀚象信息不为积分承担任何债务或偿还责任。</div>
           <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp（6）会员订阅服务是赠品，除可在MindCraft AI上使用外，不具有任何经济价值、内在价值、交换价值或其它价值。</div>
           <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp（7）积分不可转让予任何其它用户名下，并不得转让给任何其它用户使用。</div>
           <div>&nbsp&nbsp&nbsp&nbsp4、结束服务。用户或瀚象信息可随时根据实际情况中断或限期中断会员订阅服务。瀚象信息不需对任何个人或第三方负责而可以随时中断会员订阅服务或终止本协议。用户对后来的条款修改有异议，或对瀚象信息的服务不满，可以行使如下权利：</div>
           <div>&nbsp&nbsp&nbsp&nbsp（1）停止使用MindCraft AI的会员订阅服务。</div>
           <div>&nbsp&nbsp&nbsp&nbsp（2）通知瀚象信息停止对该用户的服务。用户服务结束后，用户使用会员订阅服务权利立即中止。从该时刻起，用户没有权利要求、瀚象信息也没有义务传送任何未处理的信息或提供任何未完成的服务给用户或第三方。</div>
           <div>&nbsp&nbsp&nbsp&nbsp三、 积分使用安全规则</div>
           <div>&nbsp&nbsp&nbsp&nbsp1、如瀚象信息怀疑某用户会员订阅服务状态或使用情况有异常状况，瀚象信息有权立即封闭该用户帐号直至情况查清楚为止。</div>
           <div>&nbsp&nbsp&nbsp&nbsp2、如瀚象信息怀疑某用户在会员订阅服务中有作弊情况，瀚象信息有权拒绝该用户使用积分进行支付，直至封闭该用户帐号并追究其法律责任。</div>
           <div>&nbsp&nbsp&nbsp&nbsp3、如出现用户自行计算的会员订阅服务有效期与瀚象信息后台数据库所记录的会员订阅服务有效期不符的情况，经瀚象信息核查后以瀚象信息的数据为准。</div>
           <div>&nbsp&nbsp&nbsp&nbsp4、出于安全考虑，瀚象信息将建立会员订阅服务的后台备份数据库。如在线数据库所记录的会员订阅服务有效期与备份数据库所记录的有效期有不符的情况，以备份数据库的记录为准。</div>
           <div>&nbsp&nbsp&nbsp&nbsp5、用户的帐号、密码和安全性：用户一旦注册成功，成为MindCraft AI的正式注册用户，将得到其密码和用户名。用户将对其用户名和密码安全负全部责任。瀚象信息可随时根据用户指示改变用户的密码。用户若发现任何非法使用其用户帐号或存在安全漏洞的情况，必须立即通知瀚象信息。</div>
           <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp四、免责声明（特别注意）</div>
           <div>&nbsp&nbsp&nbsp&nbsp<span style="font-weight: 600;">1、每个用户都要对以其用户名进行的所有活动和事件负全责。</span> 对于由于用户自身原因导致用户帐号、密码泄密而使其会员订阅服务被盗用或招致其它损失，瀚象信息不承担任何责任。</div>
           <div>&nbsp&nbsp&nbsp&nbsp2、瀚象信息拒绝提供担保用户个人对会员订阅服务的使用承担全部风险。瀚象信息对此不做任何类型的担保，不论是明确的或隐含的。</div>
           <div>&nbsp&nbsp&nbsp&nbsp3、瀚象信息不担保会员订阅服务一定能满足用户的要求，也不担保服务不会中断，对积分服务的及时性、安全性、出错的发生等都不做任何担保。</div>
           <div>&nbsp&nbsp&nbsp&nbsp4、瀚象信息对与使用会员订阅服务相关的任何直接、间接、偶然、特殊及继起的损害不负任何责任。这些损害可能来自：不正当使用网络服务、在网上购买课程或进行同类型服务、在网上进行交易、非法使用网络服务或用户传送的信息有所变动或其它任何原因。</div>
           <div>&nbsp&nbsp&nbsp&nbsp5、瀚象信息对于由于不可抗力所导致的会员订阅服务数据丢失、服务停顿或其它错误，将不承担任何法律或经济责任。不可抗力情况包括但不限于：</div>
           <div>&nbsp&nbsp&nbsp&nbsp（1）瀚象信息的服务器或其它计算机或网络设施遭受电脑病毒破坏而致使用户资料受损；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（2）瀚象信息的服务器或其它计算机或网络设施遭受电脑黑客入侵致使用户资料受损或被窃取；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（3）因计算机设施或操作系统软件本身固有的技术缺陷而引起的用户资料数据受损或被窃取；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（4）因维护、检修、升级系统的需要或相关的第三方为维护、检修、升级系统所使用的主机、电力设备、公共网络等相关配套设施需要而造成的故障、损失或错误；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（5）国家或地方法律法规或政府政策发生的变化以及司法机关或政府行政机关的要求造成的服务停止、中断或改变；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（6）其它无法预见、无法避免且 无法克服的客观情况。</div>
           <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp五、违反协议</div>
           <div>&nbsp&nbsp&nbsp&nbsp1、您充分理解并同意，若瀚象信息认为您违反了本协议或可能与您使用本软件相关的其他协议，瀚象信息可以终止您使用会员订阅服务的权限。</div>
           <div>&nbsp&nbsp&nbsp&nbsp2、您充分理解并同意，瀚象信息可自行决定且无需提前通知，因下列原因终止您访问本软件的权限，包括（但不限于）：</div>
           <div>&nbsp&nbsp&nbsp&nbsp（1）应政府部门和司法机关的要求；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（2）本软件或本软件提供的任何服务的中止或重大修改；</div>
           <div>&nbsp&nbsp&nbsp&nbsp（3）不可预期的技术问题。</div>
           <div>&nbsp&nbsp&nbsp&nbsp3、若因您违反本协议致使瀚象信息对您提起法律诉讼，除法律授予瀚象信息的任何其他救济外，瀚象信息有权从您处获得且您同意支付所有合理的律师费及该等诉讼费用。您同意，因对本使用协议的任何违反导致瀚象信息终止您使用本软件的权限，瀚象信息概不对您或任何第三方承担责任。</div>
           <div style="font-weight: 600;">&nbsp&nbsp&nbsp&nbsp六、争议解决（特别注意）</div>
           <div>&nbsp&nbsp&nbsp&nbsp因本协议发生的争议，应友好协商解决。协商不能解决的，任何一方均可向瀚象信息住所地人民法院提起诉讼。</div>
           <div>&nbsp&nbsp&nbsp&nbsp七、 联系方式</div>
           <div>&nbsp&nbsp&nbsp&nbsp当您有意见、建议或发现任何人违反本协议约定或以其他不当的方式使用本服务，请立即向瀚象信息反馈、举报或投诉，瀚象信息将依本协议约定进行处理。</div>
           <div>&nbsp&nbsp&nbsp&nbsp 电子邮箱： <span style="color: blue;">sales@genitop.com </span></div>
           <div>&nbsp&nbsp&nbsp&nbspCopyright 2024</div>
           <div style="margin-top: 40px;">&nbsp&nbsp&nbsp&nbsp深圳瀚象信息科技有限公司 版权所有</div>
           <div style="color: blue;">&nbsp&nbsp&nbsp&nbsp 粤ICP备2024235734号-1</div>



           
          </div>
        <!-- <template #footer>
          <div class="dialog-footer">
          <el-button type="primary" @click="ClickAgreement">
              已阅读用户协议
            </el-button>
            <el-button @click="memberSubscriptionShow = false">取消</el-button>
          </div>
        </template> -->
      </el-dialog>
    </div>
  </template>
  <!-- overflow-y:auto; -->
  
  <script setup>
  import { ref } from "vue";
  import { useMitt } from "../../utils/mitt";
  
  const mitt = useMitt();
  
  const memberSubscriptionShow = ref(false);
  
  
  mitt.on("memberSubscriptionShow", () => {
    memberSubscriptionShow.value = true;
  });

  const closeMemberSubscription = ()=>{
    memberSubscriptionShow.value = true;
  }

 defineExpose({
  closeMemberSubscription
 })
  
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
  :deep(.el-dialog__title){
      font-weight: 600;
  }
  .Title_hear > div{
   font-size: 18px;
   color: #000;
  }
  </style>
  