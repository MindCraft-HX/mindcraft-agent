<template>
    <el-row style="margin-top: 20px;">
        <el-col :span="12" style="height: 86vh;">
            <div style="padding: 10px;">

                <!-- 用户名 -->
                <div>
                    <el-input v-model="input" style="width: 240px" placeholder="Please input" />
                </div>

                <!-- 登录类型 -->
                <div style="margin-top: 10px;">
                    <el-select v-model="value" placeholder="Select" style="width: 240px">
                        <el-option v-for="item in options" :key="item.value" :label="item.label" :value="item.value"
                            :disabled="item.disabled" />
                    </el-select>
                </div>

                <!-- 登录 退出 -->
                <div style="margin-top: 10px;">
                    <el-button type="primary">登录</el-button>
                    <el-button type="danger">退出</el-button>
                </div>

                <el-divider />


                <el-form :model="form" label-width="auto" style="max-width: 600px">

                    <el-form-item label="配置类型">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="机器人昵称">
                        <el-input v-model="form.name" />
                    </el-form-item>
                    <el-form-item label="机器人描述及说明">
                        <el-input v-model="form.desc" type="textarea" />
                    </el-form-item>
                    <el-form-item label="对话模型">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="图片识别模型">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="图片生成模型">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="视频生成模型">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                </el-form>


            </div>
        </el-col>
        <el-col :span="12">
            <div style="padding: 10px;">

                <!-- 用户名 -->
                <div>
                    <el-input v-model="input" style="width: 240px" placeholder="Please input" />
                </div>

                <!-- 登录类型 -->
                <div style="margin-top: 10px;">
                    <el-select v-model="value" placeholder="Select" style="width: 240px">
                        <el-option v-for="item in options" :key="item.value" :label="item.label" :value="item.value"
                            :disabled="item.disabled" />
                    </el-select>
                </div>

                <!-- 登录 退出 -->
                <div style="margin-top: 10px;">
                    <el-button type="primary">登录</el-button>
                    <el-button type="danger">退出</el-button>
                </div>

                <el-divider />

                <el-form :model="form" label-width="auto" style="max-width: 600px">

                    <el-form-item label="配置类型">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="API BASE">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="API KEY">
                        <el-select v-model="form.region" placeholder="please select your zone">
                            <el-option label="Zone one" value="shanghai" />
                            <el-option label="Zone two" value="beijing" />
                        </el-select>
                    </el-form-item>
                </el-form>




            </div>
        </el-col>
    </el-row>
</template>

<script setup>
import { ElRow, ElCol } from 'element-plus'
import { ref, reactive } from 'vue'
const input = ref('')
const value = ref('')
const textarea = ref('')
const options = [
    {
        value: 'Option1',
        label: 'Option1',
    },
    {
        value: 'Option2',
        label: 'Option2',
        disabled: true,
    },
    {
        value: 'Option3',
        label: 'Option3',
    },
    {
        value: 'Option4',
        label: 'Option4',
    },
    {
        value: 'Option5',
        label: 'Option5',
    },
]
// do not use same name with ref
const form = reactive({
    name: '',
    region: '',
    date1: '',
    date2: '',
    delivery: false,
    type: [],
    resource: '',
    desc: '',
})

const onSubmit = () => {
    console.log('submit!')
}
</script>

<style scoped>
.divider {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 1px;
    background-color: rgb(153, 150, 150);
    ;
}
</style>