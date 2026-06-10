<template>
  <div>
    <div style="width: 100%; text-align: center">
      <el-radio-group v-model="radio1" size="large" @change="changeInformation" class="test">
        <el-radio-button label="广场" value="广场" />
        <el-radio-button label="我的" value="我的" />
      </el-radio-group>
    </div>
    <!-- 广场 -->
    <div v-if="radio1 == '广场'">
      <!-- <div style="text-align: center;font-size: 20px;padding: 5px;">音色|伴奏</div> -->
      <div style="display: flex; justify-content: center; padding: 10px 0px">
        <el-radio-group v-model="radio3" size="small" @change="changeSquareMusicType">
          <el-radio-button label="音色" value="音色" />
          <el-radio-button label="伴奏" value="伴奏" />
        </el-radio-group>
      </div>

      <el-input v-model="accompanimentOrTimbre" placeholder="搜索音色/伴奏">
        <template #append>
          <el-button :icon="Search" @click="clickSearch" />
        </template>
      </el-input>

      <!-- 歌曲列表 -->
      <div>
        <div v-if="audioInformation.length > 0">
          <el-scrollbar height="568px">
            <div class="songList" v-for="(item, index) in audioInformation" :key="index">
              <div class="songList_left">
                <div><strong>名称：</strong><el-text>{{ item.gen_name }}</el-text></div>
                <div><strong>作者：</strong><el-text>{{ item.gen_author_data.author_name }}</el-text></div>
              </div>
              <div class="songList_right">
                <!-- <div>播放</div>
                            <div>添加</div> -->
                <el-button size="small" class="playButton" @click="clickToPlay(item)">播放</el-button>
                <el-button :type="item.is_followed ? 'success' : 'default'" plain size="small" class="playButton"
                  style="margin-left: 0px" @click="clickAdd(item.gen_id, item.is_followed)">{{
        item.is_followed ? '关注' : '未关注' }}
                </el-button>
              </div>
            </div>
          </el-scrollbar>
        </div>
        <div style="height: 568px;display: flex;justify-content: center;align-items: center;" v-else>暂时无数据！！</div>

        <!-- 分页 -->
        <div>
          <el-pagination small background layout="prev, pager, next, total" style="float: right; margin-top: 16px"
            :page-sizes="[10, 20]" :total="total" :current-page="currentPage" v-model:page-size="pageSize"
            :pager-count="5" @current-change="handleCurrentChange" @size-change="handleSizeChange" />
        </div>
      </div>
    </div>
    <!-- 我的 -->
    <div v-if="radio1 == '我的'">
      <!-- <div style="text-align: center;font-size: 20px;padding: 5px;">音色|伴奏</div> -->
      <div style="display: flex; justify-content: center; padding: 10px 0px">
        <el-radio-group v-model="radio3" size="small" @change="changeMusicType">
          <el-radio-button label="音色" value="音色" />
          <el-radio-button label="伴奏" value="伴奏" />
        </el-radio-group>
      </div>

      <el-input v-model="accompanimentOrTimbre" placeholder="搜索音色/伴奏">
        <template #append>
          <el-button :icon="Search" @click="clickSearch" />
        </template>
      </el-input>

      <!-- 歌曲列表 -->
      <div v-if="audioInformation.length > 0">
        <el-scrollbar height="568px">
          <div class="songList" v-for="(item, index) in audioInformation" :key="index">
            <div class="songList_left">
              <div><strong>名称：</strong><el-text>{{ item.gen_name }}</el-text></div>
              <div><strong>作者：</strong><el-text>{{ item.gen_author_data.author_name }}</el-text></div>
            </div>
            <div class="songList_right">
              <!-- <div>播放</div> -->
              <!-- <div>添加</div> -->
              <el-button size="small" class="playButton" @click="clickToPlay(item)">播放</el-button>
            </div>
          </div>
        </el-scrollbar>
      </div>
      <div style="height: 568px;display: flex;justify-content: center;align-items: center;" v-else>暂时无数据！！</div>

      <!-- 分页 -->
      <div>
        <el-pagination small background layout="prev, pager, next, total" style="float: right; margin-top: 16px"
          :page-sizes="[10, 20]" :total="total" :current-page="currentPage" :page-size="pageSize" :pager-count="5"
          @current-change="(page) => handleCurrentChange(page, 'Mine')" @size-change="handleSizeChange" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { Search, VideoPlay, Plus } from "@element-plus/icons-vue";
import { getVoiceInstrumental, getVoiceInstrumentalFollowed } from "../../../../../../api/application/musicGeneration.js";
import { ElMessage, ElLoading } from 'element-plus';

const radio1 = ref("我的");
const radio3 = ref("音色");

const input3 = ref("");

const accompanimentOrTimbre = ref('');

const audioInformation = ref([]);

const emit = defineEmits(['add-track', 'getVoiceSelectList', 'getInstrumentalSelectList']);


onMounted(async () => {
  await squareMine("Mine");
});

/*分页******************************************************************************* */
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

const handleSizeChange = (size) => {
  pageSize.value = size;
  console.log(size, "size");
};
const handleCurrentChange = async (page, val) => {
  currentPage.value = page;
  // console.log(page, 'page');
  // console.log(val,'val');

  if (radio1.value === "广场") {
    if (radio3.value === "音色") {
      await timbreAccompaniment(
        "voice",
        true,
        pageSize.value,
        currentPage.value
      );
    } else if (radio3.value === "伴奏") {
      await timbreAccompaniment(
        "instrumental",
        true,
        pageSize.value,
        currentPage.value
      );
    }
  } else if (radio1.value === "我的") {
    if (radio3.value === "音色") {
      await timbreAccompaniment(
        "voice",
        undefined,
        pageSize.value,
        currentPage.value
      );
    } else if (radio3.value === "伴奏") {
      await timbreAccompaniment(
        "instrumental",
        undefined,
        pageSize.value,
        currentPage.value
      );
    }
  }
};


const clickSearch = async () => {
  // await timbreAccompaniment()
  if (radio1.value === "广场") {
    if (radio3.value === "音色") {
      await timbreAccompaniment(
        "voice",
        true,
        pageSize.value,
        currentPage.value,
        accompanimentOrTimbre.value,
      );
    } else if (radio3.value === "伴奏") {
      await timbreAccompaniment(
        "instrumental",
        true,
        pageSize.value,
        currentPage.value,
        accompanimentOrTimbre.value,
      );
    }
  } else if (radio1.value === "我的") {
    if (radio3.value === "音色") {
      await timbreAccompaniment(
        "voice",
        undefined,
        pageSize.value,
        currentPage.value,
        accompanimentOrTimbre.value,
      );
    } else if (radio3.value === "伴奏") {
      await timbreAccompaniment(
        "instrumental",
        undefined,
        pageSize.value,
        currentPage.value,
        accompanimentOrTimbre.value,
      );
    }
  }
}

/******************************************************************************** */
// 广场 square   我的Mine

const changeInformation = async (val) => {
  if (val === "广场") {
    await squareMine("square");
    radio3.value = "音色";
    accompanimentOrTimbre.value = '';
  } else if (val === "我的") {
    await squareMine("Mine");
    radio3.value = "音色";
    accompanimentOrTimbre.value = '';
  }
};

const changeMusicType = async (val) => {
  if (val === "音色") {
    currentPage.value = 1;
    await timbreAccompaniment(
      "voice",
      undefined,
      pageSize.value,
      currentPage.value
    );
  } else if (val === "伴奏") {
    currentPage.value = 1;
    await timbreAccompaniment(
      "instrumental",
      undefined,
      pageSize.value,
      currentPage.value
    );
  }
};

const changeSquareMusicType = async (val) => {
  if (val === "音色") {
    await timbreAccompaniment("voice", true);
  } else if (val === "伴奏") {
    await timbreAccompaniment("instrumental", true);
  }
};

// 添加
const clickAdd = async (id, isFollowed) => {
  try {
    const footdata = {
      gen_id: id,
      is_followed: !isFollowed,
    };
    await getVoiceInstrumentalFollowed(footdata);
    if (radio3.value === "音色") {
      await timbreAccompaniment(
        "voice",
        true,
        pageSize.value,
        currentPage.value
      );
      emit('getVoiceSelectList');
    } else if (radio3.value === "伴奏") {
      await timbreAccompaniment(
        "instrumental",
        true,
        pageSize.value,
        currentPage.value
      );
      emit('getInstrumentalSelectList')
    }
    if (!isFollowed) {
      ElMessage.success("已添加");
    } else {
      ElMessage.warning("已取消");
    }
  } catch (error) {
    console.log(error, 'error');
    ElMessage.error("操作失败");
  }
};

//播放
const clickToPlay = (item) => {
  if (item.music_data.music_url) {
    const { gen_author_data, music_data } = item;
    const combinedData = { ...gen_author_data, ...music_data };
    // console.log(combinedData,'combinedData>>>>>>>>');
    emit('add-track', combinedData);
  } else {
    ElMessage.warning("该音色/伴奏暂无音频");
  }
}



// 广场 我的
const squareMine = async (type) => {
  if (type === "square") {
    const gen_category = "voice";
    const gen_share = true;
    const size = 10;
    const page = 1;
    try {
      const res = await getVoiceInstrumental(
        gen_category,
        gen_share,
        size,
        page
      );
      audioInformation.value = res.data.results;
      total.value = res.data.count;
    } catch (error) {
      console.log(error);
    }
  } else if (type === "Mine") {
    const gen_category = "voice";
    const gen_share = undefined;
    const size = 10;
    const page = 1;
    try {
      const res = await getVoiceInstrumental(
        gen_category,
        gen_share,
        size,
        page
      );
      audioInformation.value = res.data.results;
      total.value = res.data.count;
    } catch (error) {
      console.log(error);
    }
  }
};

// 音色 伴奏
const timbreAccompaniment = async (gen_category, gen_share, size, page, gen_name) => {
  try {
    const res = await getVoiceInstrumental(gen_category, gen_share, size, page, gen_name);
    audioInformation.value = res.data.results;
    total.value = res?.data.count || 0;
    console.log();
  } catch (error) {
    console.log(error);
  }
};
</script>

<style scoped>
.test {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}
:deep(.test .el-radio-button__inner), :deep(.test .el-radio-button) {
  max-width: 148px;
  width: 100%;
  flex: 1;
}

.songList {
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  margin: 10px 0px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* height: 80px; */
  padding: 10px;
}

.songList_left {
  width: 70%;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-around;
}

.songList_right {
  /* width: 20%; */
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-around;
}

:deep(.playButton .el-icon) {
  font-size: 16px;
}
</style>
