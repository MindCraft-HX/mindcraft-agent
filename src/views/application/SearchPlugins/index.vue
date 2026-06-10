<template>
  <div class="Plugins-Header">
    <div>
      <!-- <p class="Plugins-title">字库芯片Lib助手</p> -->
      <!-- <el-input class="Plugins-nav" v-model="input" placeholder="请输入应用名称">
        <template #append>
          <el-button :style="{ backgroundColor: '#409EFF', color: '#FFFFFF' }" type="primary" :icon="Search" />
        </template>
      </el-input> -->
    </div>
    <!-- 插件目录 -->
    <div style="width: 100%;margin-top: 10px;">
      <div style="width: 100%;height:100%;padding: 18px 47px;box-sizing: border-box;">
        <template v-if="Object.keys(filteredMenuItems).length > 0">
          <!-- 侧边栏 -->
          <MenuItem v-for="(items, title) in filteredMenuItems" :key="title" :title="title"
            :menuColor="getMenuColor(title)" :headerColor="getHeaderColor(title)" :items="items"
            :logo="getLogo(title)" />
        </template>
        <template v-else>
          <div class="no-results">请输入正确的应用名称!</div>
        </template>
      </div>
    </div>
  </div>

  <!-- 自动库公告弹窗 -->
  <el-dialog v-model="notice_dialogVisible" title="公告" width="500">
    <div>
      <div style="font-size: 14px;">
        &nbsp&nbsp&nbsp&nbsp&nbsp请确认芯片下方批次号（类似2130Z）。若前四位小于2240，可能无法使用MindCraftAI自动库Lib助手生成的SDK库文件。请联系销售或技术人员获取相应SDK库文件。我们客服团队随时为您提供支持。
      </div>
      <div class="chip_img"></div>
      <div><span style="font-weight: 600;">联系方式：</span>如有任何疑问或需要进一步帮助，请通过以下方式联系我们：</div>

      <div>电话： 0775-83453881</div>
      <div>邮箱：<el-link type="primary">sales@genitop.com</el-link></div>
      <div>官方网站：http://www.hmi.gaotongfont.cn</div>
      <div>
        <div class="HMI_img"></div>
        <p>高通GT-HMI交流群</p>
      </div>
    </div>
  </el-dialog>

</template>

<script setup>
import { ref, computed } from 'vue';
import { Search, Menu as IconMenu, Cpu } from "@element-plus/icons-vue";
import { useRouter } from 'vue-router';
import MenuItem from './components/MenuItem.vue';
import { loginFontLab } from "../../../api/application/font_lab.js";
import { ElMessage } from "element-plus";
import { useMitt } from '../../../utils/mitt.js';

import logoPath from '../../../assets/logo-html.png';
import AIImg from '../../../assets/application/ai_ss.png';
import pptImg from '../../../assets/450.png';
import FontLabImg from '../../../assets/application/gt_font_lab.png'
import encodingDetectorImg from '../../../assets/application/zf_bm_cxq.png'
import aiSpeechLabImg from '../../../assets/application/ai_yy_sys.png'
import characterSquareImg from '../../../assets/application/js_gc.png'
import bangonggongju from '../../../assets/application/bangonggongju.png'
import translationToolImg from '../../../assets/application/fy_sq.png'
import writingToolImg from '../../../assets/application/xz_sq.png'
import conferenceTranscriptionImg from '../../../assets/application/hy_zl.png'

const mitt = useMitt();
const router = useRouter();
const notice_dialogVisible = ref(false);
const input = ref('');

const logo = logoPath;
const AILogo = "#icon-a-zu433";
const aiPttImg = "#icon-a-zu432";
const gaoTongImg = "#icon-a-zu429";
const OtherApplications = "#icon-qitayingyong";


const openFontLibrary = () => {
  router.push('/approvalForm');
  notice_dialogVisible.value = true;
};

const openEncodingDetector = () => {
  const token = localStorage.getItem("access_token");
  let url = `https://www.mindcraft.com.cn/activity/client/decode/?token=${token}`+'&t='+Date.now()
  if(window.VITE_NODE_ENV != 'production') {
    const baseURL = localStorage.getItem("baseURL")
    url = `https://www.mindcraft.com.cn/${baseURL.includes('grayapi') ? 'test' : 'activity'}/client/decode/?token=${token}`+'&t='+Date.now()
  }  
  window.electronAPI.openNewWindow(url);
}

const openSpeechLab = () => {
  // router.push('/speechLab');
  const token = localStorage.getItem("access_token");
  let url = `https://www.mindcraft.com.cn/activity/client/speechLab/?token=${token}`+'&t='+Date.now()
  if(window.VITE_NODE_ENV != 'production') {
    const baseURL = localStorage.getItem("baseURL")
    url = `https://www.mindcraft.com.cn/${baseURL.includes('grayapi') ? 'test' : 'activity'}/client/speechLab/?token=${token}`+'&t='+Date.now()
  }
  window.electronAPI.openNewWindow(url);
}

const openCharacterSquare = () => {
  router.push('/characterSquare');
}

const openPPT = () => {
  window.electronAPI.openNewWindow('https://zhiwen.xfyun.cn/');

}

const openSecretPagoda = () => {
  const access_token = localStorage.getItem("access_token");
  window.electronAPI.openNewWindow('https://www.mindcraft.com.cn/search/'+`?token=${access_token}`);
}

const openVideoGeneration = () => {
  router.push('/videoGeneration');
}

const openMusicGeneration = () => {
  router.push('/musicGeneration');
}

const OpenWeChatGPTFunction = ()=>{
  router.push('/wechatgptfunction');
}


/*FontLab免登录操作**** */
const userInfo = ref({});
// const status = ref("");
const Hint = ref("1");

const openFontLab = async () => {
  window.electronAPI.checkFolder();
  window.electronAPI.removeAllListeners("folder-status"); // 移除之前的监听器

  const folderStatusPromise = new Promise((resolve) => {
    window.electronAPI.onFolderStatus(async (event, status) => {
      if (status === "文件夹存在") {
        console.log("文件夹存在");
        // 如果有走这里
        try {
          await loginFontLab().then((res) => {
            // console.log(res.data, "res");
            userInfo.value = res.data;
          });

          const xmlContent = await window.electronAPI.readXmlFile();
          // console.log(xmlContent, "xmlContent");

          // 更新 XML 文件内容
          const updatedData = [
            { username: userInfo.value.user_name },
            { password: userInfo.value.user_pwd },
          ];
          await window.electronAPI.updateXmlFile(updatedData);

          // 重新读取更新后的 XML 文件内容
          // xmlContent.value = await window.electronAPI.readXmlFile();
          // console.log(xmlContent.value, "updated xmlContent");
          window.electronAPI.startExe(); // 启动exe
          Hint.value = "2";
        } catch (error) {
          console.log(error, "error");
        }
      } else if (status === "文件夹和文件已创建") {
        console.log("文件夹和文件已创建");
        try {
          //不存在逻辑
          await loginFontLab().then((res) => {
            // console.log(res.data, "res");
            userInfo.value = res.data;
          });

          const updatedData = [
            { username: userInfo.value.user_name },
            { password: userInfo.value.user_pwd },
          ];

          await window.electronAPI.updateXmlFile(updatedData);

          // // 重新读取更新后的 XML 文件内容
          const xmlContent = await window.electronAPI.readXmlFile();
          // console.log(xmlContent, "updated xmlContent");
          window.electronAPI.startExe(); // 启动exe
          Hint.value = "2";
        } catch (error) {
          console.log(error, "error");
        }
      }
      resolve();
    });
  });

  await folderStatusPromise;

  // 检查标识变量
  if (Hint.value === "1") {
    ElMessage.warning("请以管理员身份运行此软件，以确保所有功能正常工作。");
  }
};

/*侧边栏数据******************************************************************* */

//导航菜单 数据
const menuItems = ref({
  // 'AI搜索': [
  //   {
  //     keyword: '秘塔AI',
  //     backgroundImg: AIImg,
  //     width: '98px',
  //     height: '20px',
  //     action: openSecretPagoda,
  //   }
  // ],
  // 'AI_PPT': [
  //   {
  //     keyword: "讯飞智文",
  //     backgroundImg: pptImg,
  //     width: '100px',
  //     height: '20px',
  //     action: openPPT,
  //   },
  // ],
  '高通字库应用': [
    {
      name: '自动库Lib助手',
      color: '#000',
      icon: '#icon-a-zu431',
      action: openFontLibrary,
    },
    {
      name: 'GT-FontLab',
      backgroundImg: FontLabImg,
      width: '54px',
      height: '54px',
      action: openFontLab,
    },
    {
      name: '字符编码查询器',
      backgroundImg: encodingDetectorImg,
      width: '54px',
      height: '54px',
      action: openEncodingDetector,
    }
  ],
  'MindCraft实验室': [
    {
      name: 'AI语音实验室',
      backgroundImg: aiSpeechLabImg,
      width: '54px',
      height: '54px',
      action: openSpeechLab,
    },
    {
      name: '图片/视频生成',
      color: '#107EFE',
      icon: '#icon-bofang',
      action: openVideoGeneration,
    },
    // {
    //   name: '音乐生成',
    //   color: '#107EFE',
    //   icon: '#icon-yinle1',
    //   action: openMusicGeneration,
    // },
    {
      name: '角色广场',
      backgroundImg: characterSquareImg,
      width: '54px',
      height: '54px',
      action: openCharacterSquare,
    },
    // {
    //   name: '微信GPT功能',
    //   color: '#107EFE',
    //   icon: '#icon-yinle1',
    //   action: OpenWeChatGPTFunction,
    // },
  ],
  '办公工具': [
    {
      name: 'AI搜索',
      backgroundImg: AIImg,
      width: '54px',
      height: '54px',
      action: openSecretPagoda,
    },
    // {
    //   name: '翻译神器',
    //   backgroundImg: translationToolImg,
    //   width: '54px',
    //   height: '54px',
    //   action: openSecretPagoda,
    // },
    // {
    //   name: '写作神器',
    //   backgroundImg: writingToolImg,
    //   width: '54px',
    //   height: '54px',
    //   action: openSecretPagoda,
    // },
    // {
    //   name: '会议转录',
    //   backgroundImg: conferenceTranscriptionImg,
    //   width: '54px',
    //   height: '54px',
    //   action: openSecretPagoda,
    // },
  ]
  // '其他应用': [
  //   {
  //     keyword: '秘塔AI',
  //     backgroundImg: AIImg,
  //     width: '98px',
  //     height: '20px',
  //     action: openSecretPagoda,
  //   },
  //   {
  //     keyword: "讯飞智文",
  //     backgroundImg: pptImg,
  //     width: '100px',
  //     height: '20px',
  //     action: openPPT,
  //   }
  // ],
});

//输入框关键字查找
const filteredMenuItems = computed(() => {
  const keyword = input.value.toLowerCase();
  const result = {};
  for (const [title, items] of Object.entries(menuItems.value)) {
    const filteredItems = items.filter(item =>
      item.name?.toLowerCase().includes(keyword) ||
      item.keyword?.toLowerCase().includes(keyword) ||
      title.toLowerCase().includes(keyword)
    );
    if (filteredItems.length > 0) {
      result[title] = filteredItems;
    }
  }
  return result;
});

const getMenuColor = (title) => {
  switch (title) {
    case 'AI搜索': return '#E5F8FF';
    case 'AI_PPT': return '#FFEAEF';
    case '其他应用': return '#E5F8FF';
    case '高通字库应用': return '#E8FFF3';
    case 'MindCraft实验室': return '#d8ebff';
    case '办公工具': return '#FFF9F0';
    default: return '#FFFFFF';
  }
};

const getHeaderColor = (title) => {
  switch (title) {
    case 'AI搜索': return '#5393DA';
    case 'AI_PPT': return '#C96A7D';
    case '其他应用': return '#5393DA';
    case '高通字库应用': return '#45817F';
    case 'MindCraft实验室': return '#000';
    case '办公工具': return '#FFF9F0';
    default: return '#000';
  }
};

const getLogo = (title) => {
  switch (title) {
    case 'AI搜索': return AILogo;
    case 'AI_PPT': return aiPttImg;
    case '高通字库应用': return gaoTongImg;
    case 'MindCraft实验室': return logo;
    case '其他应用': return OtherApplications;
    case '办公工具': return bangonggongju;
    default: return '';
  }
};
</script>

<style scoped>
body,
html {
  margin: 0;
  padding: 0;
}

.Plugins-Header {
  /* border: 1px solid #d0cccc; */
  /* height: 60vh; */
  /* margin-top: 10px; */
  /* height: calc(94vh - 50px); */
  /* background-color: yellow; */
  height: 88vh;
  /* border-bottom: 1px solid #ccc; */
  border-radius: 5px;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.Plugins-nav {
  margin-top: 14px;
}

.Plugins-title {
  border-radius: 16px;
  /* border: 1px solid #e8e9fb; */
  box-shadow: 0 0 10px #e8e9fb;
  text-align: center;
  width: 160px;
  color: #409eff;
  margin-left: 14px;
}

.chip_img {
  background-image: url(../../../assets/chip.png);
  background-size: 100% 100%;
  width: 150px;
  height: 150px;
  margin: 10px 0px;
}

.HMI_img {
  background-image: url(../../../assets/hmi_code.jpg);
  background-size: 100% 100%;
  width: 150px;
  height: 150px;
  margin: 10px 0px;
}

.no-results {
  height: 82vh;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #909399;
  font-size: 14px;
}
</style>