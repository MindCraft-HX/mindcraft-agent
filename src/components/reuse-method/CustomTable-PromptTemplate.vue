<template>
  <el-table :data="DataList" :default-sort="{ prop: 'id', order: 'ascending' }" border stripe style="width: 100%"
    :row-key="(row) => row.id" @row-click="handleExpandChange">
    <el-table-column label="选择" width="70" v-if="showSelect">
      <template v-slot="{ row }">
        <!-- <el-radio v-model="selectedPrompt" :label="scope.row.id" @change="rowClick(scope.row)">{{ "" }}</el-radio> -->
        <el-button class="button-option" icon="SwitchButton" :type="props.selectedRowId === row.id ? 'success' : ''" style="height: 36px;width: 36px;" @click.once.stop="rowClick(row)"></el-button>
      </template>
    </el-table-column>
    <el-table-column label="关注" width="90" v-if="showAttention">
      <template #default="{ row }">
        <el-switch v-model="row.attention" inline-prompt active-text="已关注" inactive-text="未关注"
          @change="unFollowSwitch(row)" @click.stop  />
      </template>
    </el-table-column>
    <el-table-column prop="prompt_name" label="指令名称">
      <template #default="{ row }">
         <div style="display: flex;">
          <div>{{row.prompt_name}}</div>
          <el-tag effect="dark" type="success" style="margin-left: 20px" v-if="showTag && row.followed_count !== 0 ">{{`${row.followed_count}次关注`}}</el-tag>
         </div>
      </template>
    </el-table-column>
    <el-table-column prop="prompt_type_label" label="指令类型" width="120" v-if="showPromptTypeLabel"></el-table-column>
    <el-table-column width="180" prop="updated_at" label="更新时间" v-if="showUpdated"></el-table-column>
    <el-table-column label="操作" width="110" v-if="showOperation">
      <template #default="{ row }">
        <el-button type="primary" size="small" icon="Edit" @click.stop="openEditDialog(row)" />
        <el-button type="danger" size="small" icon="Delete" @click.stop="deletePrompt(row)" />
        
      </template>
    </el-table-column>
    <el-table-column type="expand" v-if="showPullDown">
      <template #default="{ row }">
        <el-table :data="[row]" style="width: 100%">
          <el-table-column label="详细内容">
            <template #default slot-scope="{ row }">
              <el-card class="card-first">
                <div>
                  <span>创建用户: {{ row.created_by }}</span>
                  <span>共享: {{ row.is_shared_label }}</span>
                  <span>回复发散性：{{ row.llm_temperature_label }}</span>
                </div>
                <div>
                  <span>更新时间: {{ row.updated_at }}</span>
                  <span>创建时间: {{ row.created_at }}</span>
                </div>
                <div>指令内容：</div>
                <div v-if="row.prompt_type === 'standard'">
                  {{ row.standard_prompt }}
                </div>
                <div v-else-if="row.prompt_type === 'personalized'">
                  <div>
                    User Profile:
                    {{
                      formatPersonalizedPrompt(row.personalized_prompt)
                        .user_profile
                    }}
                  </div>
                  <div>
                    Response Preference:
                    {{
                      formatPersonalizedPrompt(row.personalized_prompt)
                        .response_preference
                    }}
                  </div>
                </div>
                <div v-else-if="row.prompt_type === 'customized'">
                  {{ formatCustomizedPrompt(row.customized_prompt) }}
                </div>
              </el-card>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-table-column>
  </el-table>
</template>
<script setup>
import { ref, watch } from "vue";

const selectedPrompt = ref(props.selectedPrompt);
const showAttention = ref(props.showAttention);
const showOperation = ref(props.showOperation);
const showPullDown = ref(props.showPullDown);
const showSelect = ref(props.showSelect);
const showPromptTypeLabel = ref(props.showPromptTypeLabel);
const showTag = ref(props.showTag);
const showUpdated = ref(props.showUpdated);

const props = defineProps({
  DataList: Array,
  selectedPrompt: Number,
  showAttention: Boolean,
  showOperation: Boolean,
  showPullDown: Boolean,
  showSelect: Boolean,
  showPromptTypeLabel:Boolean,
  showTag:Boolean,
  showUpdated:Boolean,
  selectedRowId: Number,
});

watch(() => props.selectedPrompt, (newVal) => {
  selectedPrompt.value = newVal;
}, { immediate: true });

const emit = defineEmits(["row-click", "un-follow-switch", "open-edit-dialog", "delete-prompt"]);

const rowClick = (row) => {
  emit("row-click", row);
};

const unFollowSwitch = (row) => {
  emit("un-follow-switch", row);
};

const openEditDialog = (row) => {
  emit("open-edit-dialog", row);
};

const deletePrompt = (row) => {
  emit("delete-prompt", row);
}

const handleExpandChange = (row)=>{
  emit("row-click", row);
}

</script>

<style scoped>
:deep(.button-option .el-icon){
  /* width: 36px;
  height: 36px; */
  font-size: 24px;
}
</style>