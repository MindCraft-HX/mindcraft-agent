<template>
  <div class="price-detail">
    <div class="model-price">模型定价 1RMB = 1000 积分</div>
    <el-table
      :data="aiTable"
      :span-method="(params) => objectSpanMethod(params, aiTable, [0])"
      style="width: 100%; margin-top: 20px"
      :cell-style="cellStyle"
      v-if="tableTitle[0]"
    >
      <el-table-column prop="model_brand" :label="tableTitle[0]" width="84">
        <template #default="{ row }">
          <div class="model-info flex-column2center">
            <img class="model-img" :src="row.model_image" alt="" srcset="" />
            <div class="model-brand">{{ row.model_brand }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        class-name="text-center"
        prop="model_name"
        label="模型名称"
      />
      <el-table-column prop="model_content" label="描述" width="130" />
      <el-table-column
        class-name="text-center"
        prop="model_traits"
        label="功能"
        width="73"
      >
        <template #default="{ row }">
          <span v-html="row.model_traits"></span>
        </template>
      </el-table-column>
      <el-table-column
        class-name="text-center"
        prop="max_tokens"
        label="最大上下文 （Tokens）"
      />
      <el-table-column
        class-name="text-center"
        prop="model_max_tokens"
        label="最大输出"
      />
      <el-table-column
        class-name="text-center"
        prop="prompt_cost"
        label="输入费用/ 1K tokens"
      />
      <el-table-column
        class-name="text-center"
        prop="completion_cost"
        label="输出费用/ 1K tokens"
      />
      <!-- <el-table-column prop="token_rate" label="Token比例">
        <template #default="{ row }">
          <span v-html="row.token_rate"></span>
        </template>
      </el-table-column> -->
      <!-- <el-table-column
        class-name="text-center"
        prop="average_content"
        label="成本预估 （分/每千汉字）"
      /> -->
    </el-table>
    <el-table
      :data="voiceTable"
      :span-method="(params) => objectSpanMethod(params, voiceTable, [0, 1])"
      style="width: 100%; margin-top: 20px"
      :cell-style="cellStyle"
      v-if="tableTitle[1]"
    >
      <el-table-column prop="model_brand" :label="tableTitle[1]" width="84">
        <template #default="{ row }">
          <div class="model-info flex-column2center">
            <img class="model-img" :src="row.model_image" alt="" srcset="" />
            <div class="model-brand">{{ row.model_brand }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        class-name="type-text"
        prop="type"
        label="类型"
        width="67"
      />
      <el-table-column
        class-name="text-center"
        prop="model_title"
        label="产品标签"
      />
      <el-table-column
        class-name="text-center"
        prop="category_name"
        label="产品标识"
      />
      <el-table-column prop="description" label="描述" width="312">
        <template #default="{ row }">
          <span v-html="row.description"></span>
        </template>
      </el-table-column>
      <el-table-column
        class-name="text-center"
        prop="model_price"
        label="费用"
      />
    </el-table>
    <el-table
      :data="multimodalTable"
      :span-method="(params) => objectSpanMethod(params, multimodalTable, [0])"
      style="width: 100%; margin-top: 20px"
      :cell-style="cellStyle"
      v-if="tableTitle[2]"
    >
      <el-table-column prop="category_name" :label="tableTitle[2]" width="84">
        <template #default="{ row }">
          <div class="model-info flex-column2center">
            <div class="model-brand">{{ row.category_name }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        class-name="type-text"
        prop="model_name"
        label="模型名称"
      />
      <el-table-column
        class-name="text-center"
        prop="model_content"
        label="模型描述"
      />
      <el-table-column
        class-name="text-center"
        prop="model_brand"
        label="模型品牌"
      >
        <template #default="{ row }">
          <div class="model-info flex-column2center">
            <img class="model-img" :src="row.model_image" alt="" srcset="" />
            <div class="model-brand">{{ row.model_brand }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        class-name="text-center"
        prop="model_price"
        label="成本"
      />
    </el-table>
    <el-table
      :data="agentTable"
      :span-method="(params) => objectSpanMethod(params, agentTable, [0])"
      style="width: 100%; margin-top: 20px"
      :cell-style="cellStyle"
      v-if="tableTitle[3]"
    >
      <el-table-column prop="category_name" :label="tableTitle[3]" width="84">
        <template #default="{ row }">
          <div class="model-info flex-column2center">
            <div class="model-brand">{{ row.category_name }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        class-name="type-text"
        prop="model_name"
        label="模型名称"
      />
      <el-table-column
        class-name="text-center"
        prop="model_content"
        label="模型描述"
      />
      <el-table-column
        class-name="text-center"
        prop="model_brand"
        label="模型品牌"
      >
        <template #default="{ row }">
          <div class="model-info flex-column2center">
            <img class="model-img" :src="row.model_image" alt="" srcset="" />
            <div class="model-brand">{{ row.model_brand }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        class-name="text-center"
        prop="model_price"
        label="成本"
      />
    </el-table>
    <el-backtop :right="100" :bottom="100" />
  </div>
</template>

<script setup>
import { ref } from "vue";
import { getStowageConsume } from "../../../api/mainActivity/pointCard/stowageDetails.js";
const aiTable = ref([]);
const voiceTable = ref([]);
const multimodalTable = ref([]);
const agentTable = ref([]);
const tableTitle = ref([]);
const getPriceDetail = () => {
  getStowageConsume().then((data) => {
    console.log(data);
    if (data?.data?.status === 200) {
      tableTitle.value = Object.keys(data?.data?.data) || [];
      let list = Object.values(data?.data?.data) || [];
      if (list.length) {
        const formatData = list.reduce(
          (p, r, i) => {
            Object.values(r).map((model, index) => {
              const style = {
                background: [
                  "#F0FFF9",
                  "#FEF7F2",
                  "#F9F9FF",
                  "#F2F7FF",
                  "#FFF6F8",
                ][index % 4],
                fontSize: "12px",
                color: "#606266",
              };
              if (i === 0) {
                model.model_list.map((item) => {
                  item.model_traits = item.model_traits.replace("\n", "<br>");
                  item.token_rate = item.token_rate.replace("\n", "<br>");
                  p.aiTable.push({
                    ...item,
                    style,
                    model_brand: model.model_brand,
                    model_image: model.model_image,
                  });
                });
              } else if (i == 1) {
                model.tts_model_list.map((item) => {
                  item.description = item.description.replace("\n", "<br>");
                  p.voiceTable.push({
                    ...item,
                    style,
                    model_brand: model.model_brand,
                    model_image: model.model_image,
                    type: "TTS",
                  });
                });
                model.asr_model_list.map((item) => {
                  item.description = item.description.replace("\n", "<br>");
                  p.voiceTable.push({
                    ...item,
                    style,
                    model_brand: model.model_brand,
                    model_image: model.model_image,
                    type: "ASR",
                  });
                });
              } else if (i == 2) {
                console.log(model);
                model.model_list.map((item) => {
                  p.multimodalTable.push({
                    ...item,
                    style,
                    category_name: model.category_name,
                  });
                });
              } else if (i == 3) {
                model.model_list.map((item) => {
                  p.agentTable.push({
                    ...item,
                    style,
                    category_name: model.category_name,
                  });
                });
              }
            });
            return p;
          },
          {
            aiTable: [],
            voiceTable: [],
            multimodalTable: [],
            agentTable: [],
          }
        );
        aiTable.value = formatData.aiTable;
        voiceTable.value = formatData.voiceTable;
        multimodalTable.value = formatData.multimodalTable;
        agentTable.value = formatData.agentTable;
      }
    }
  });
};
getPriceDetail();

const objectSpanMethod = (
  { row, column, rowIndex, columnIndex },
  table,
  fillterLine
) => {
  if (fillterLine.includes(columnIndex)) {
    const currentValue = row[column.property];
    const preRow = table[rowIndex - 1];
    const preValue = preRow ? preRow[column.property] : null;
    if (currentValue === preValue) {
      return { rowspan: 0, colspan: 0 };
    } else {
      let rowspan = 1;
      for (let i = rowIndex + 1; i < table.length; i++) {
        const nextRow = table[i];
        const nextValue = nextRow[column.property];
        if (nextValue === currentValue) {
          rowspan++;
        } else {
          break;
        }
      }
      return { rowspan, colspan: 1 };
    }
  }
};

const cellStyle = ({ row, column, rowIndex, columnIndex }) => {
  return row.style;
};
</script>

<style lang="scss" scoped>
.flex-column2center{
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
.price-detail {
  width: 100%;
  min-height: 100%;
  padding: 0;
  .model-price {
    width: 100%;
    font-weight: bold;
    font-size: 11px;
    color: #606266;
    margin-top: 17px;
    text-align: right;
  }
  .model-info {
    padding: 6px 0;
    .model-img {
      width: 27px;
      height: 27px;
    }
    .model-brand {
      font-weight: bold;
      font-size: 11px;
      color: #606266;
      margin-top: 4px;
    }
  }
  .type-text {
    font-weight: bold;
    font-size: 11px;
    color: #606266;
    text-align: center;
  }
  .text-center {
    text-align: center;
  }
}

.el-notification {
  width: fit-content;
}

:deep(.el-table) {
  --el-bg-color: #f8f8f9;
  --el-table-border: 5px #fff solid;
  --el-table-border-color: #fff;
  .el-table__cell {
    height: 47px;
  }
  .el-table__header {
    width: 100%;
    .el-table__cell {
      font-weight: bold;
      font-size: 9px;
      color: #606266;
      text-align: center;
      &:first-child .cell {
        font-size: 14px;
        line-height: 15px;
        .cell {
          overflow: visible;
        }
      }
    }
  }
  .el-scrollbar {
    --el-table-row-hover-bg-color: initial;
    --el-table-tr-bg-color: #fff;
    :deep(.el-table_1_column_6) {
      border-right: var(--el-table-border);
      border-radius: 18px 0px 0px 18px;
    }
    .el-table_2_column_6 {
      border-right: var(--el-table-border);
      border-radius: 18px 0px 0px 18px;
    }
    .el-table_3_column_16 {
      border-right: var(--el-table-border);
    }
    .el-table_4_column_22 {
      border-right: var(--el-table-border);
      border-radius: 18px 0px 0px 18px;
    }
    .el-table_5_column_27 {
      border-right: var(--el-table-border);
      border-radius: 18px 0px 0px 18px;
    }
  }
}
</style>