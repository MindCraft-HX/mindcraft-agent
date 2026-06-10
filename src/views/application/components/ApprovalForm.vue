<template>
  <div style="display: flex;">
    <sidebar :menuList="[{name: '字库芯片Lib助手'}]">
      <template #title>
        <span @dblclick.stop="activateStepFive" @click.stop>自动库Lib助手</span>
      </template>
    </sidebar>
    <div class="App-Header">
      <!-- <p class="App-title">字库芯片Lib助手</p> -->
      <!-- 表单部分 -->
      <div v-loading="spannedFileLoading" element-loading-text="生成文件中...">
        <el-card style="margin-top: 5px; margin-bottom: 10px" shadow="never">
          <el-form ref="formRef" :model="numberValidateForm" label-width="150px" class="demo-ruleForm">

            <el-form-item>
              <template #label>
                <span @click.stop="activateStepFour">字库型号:</span>
              </template>
              <el-select style="width: 350px;" v-model="fontLibInfo.font" placeholder="请选择字库" filterable default-first-option clearable
                no-match-text="目前没该字库型号!">
                <el-option v-for="item in fontList" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <template #label>
                <span @click.stop="activateStepThree">处理器架构位数:</span>
              </template>
              <el-select style="width: 350px;" v-model="fontLibInfo.mcuArch" placeholder="请选择处理器架构" @change="onChangeMcuArch">
                <el-option v-for="item in optionsChmDecomposer" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-tooltip 
                  placement="bottom"
                  effect="dark">
                  <div style="
                      width: 20px;
                      height: 20px;
                      margin: 11px 0px 0px 8px;
                      color: #a9b5c0;
                      cursor: pointer;
                    ">
                    <InfoFilled />
                  </div>
                  <template #content>
                    <p> 请根据您使用的处理器架构选择位数：</p>
                    <p>• 8位：8051、AVR、STM8、PIC（8位系列）等</p>
                    <p>• 32位：ARM、RISC-V、Xtensa、MIPS、PIC32 等</p>
                  </template>
                </el-tooltip>
            </el-form-item>
            
            <el-form-item >
              <template #label>
                <span @dblclick.stop="activateStepTwo" @click.stop>本地编译器:</span>
              </template>
              <el-select style="width: 350px;" v-model="fontLibInfo.compilerVersion" placeholder="请选择编译器版本" @change="onChangeCompilerVersion">
                <el-option v-for="item in optionCompilerVersion" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-popover placement="bottom" :width="780" trigger="hover"  v-if="fontLibInfo.compilerVersion === 'GCC'">
                  <template #reference>
                    <div style="
                        width: 20px;
                        height: 20px;
                        margin: 11px 0px 0px 8px;
                        color: #a9b5c0;
                      ">
                      <InfoFilled />
                    </div>
                  </template>
                  <template #default>
                    <div class="local-compiler-guide">
                      <div class="local-compiler-guide-title">嵌入式常用芯片 GCC 编译工具链对照表</div>
                      <table class="local-compiler-guide-table">
                        <tbody>
                          <tr>
                            <th>芯片系列 / 架构</th>
                            <th>典型代表</th>
                            <th>GCC 工具链名称</th>
                          </tr>
                          <tr>
                            <td>ARM Cortex-M</td>
                            <td>STM32、GD32、雅特力、APM32</td>
                            <td><code>arm-none-eabi-gcc</code></td>
                          </tr>
                          <tr>
                            <td>RISC-V</td>
                            <td>ESP32-C3/C6、CH32V系列、K210</td>
                            <td><code>riscv32-unknown-elf-gcc</code></td>
                          </tr>
                          <tr>
                            <td>AVR</td>
                            <td>Arduino (ATmega328P)</td>
                            <td><code>avr-gcc</code></td>
                          </tr>
                          <tr>
                            <td>乐鑫 Xtensa</td>
                            <td>ESP32、ESP32-S3</td>
                            <td><code>xtensa-esp32-elf-gcc</code></td>
                          </tr>
                        </tbody>
                      </table>
                      <div class="local-compiler-guide-note">
                        仅供参考：实际使用时请以芯片厂商官方文档或 SDK 要求的工具链名称为准。
                      </div>
                    </div>
                  </template>
                </el-popover>
            </el-form-item>


            <!-- keil:编译器版本、路径、工程导入 -->
            <el-form-item v-if="isKeil || fontLibInfo.compilerVersion == 'IAR'">
              <template #label>
                <span >本地编译器路径:</span>
              </template>
              <!-- 上传功能路径 本地编译器路径 -->
              <div style="
                  display: flex;
                  justify-content: center;
                  align-items: flex-start;
                ">
                <el-input v-model="fontLibInfo.compilerPath" placeholder="请导入本地keil编译器的安装路径" clearable
                  style="width: 350px; margin-right: 5px" />
                <el-button type="primary" @click="onChangeCompilerPath">选择</el-button>
                <el-popover placement="bottom" :width="isKeil?550:800" trigger="hover">
                  <template #reference>
                    <div style="
                        width: 20px;
                        height: 20px;
                        margin: 11px 0px 0px 8px;
                        color: #a9b5c0;
                      ">
                      <InfoFilled />
                    </div>
                  </template>
                  <template #default>
                    <!-- 显示内容 -->
                    <div  v-if="isKeil" class="compile_img"></div>
                    <div  v-else-if="fontLibInfo.compilerVersion == 'IAR'" class="compile_img_iar"></div>
                  </template>
                </el-popover>
              </div>
            </el-form-item>
              <!-- 上传功能路径 工程参数一键导入  -->
            <el-form-item v-if="isKeil">
              <template #label>
                <span >工程参数一键导入:</span>
              </template>
              <div style="
                  display: flex;
                  justify-content: center;
                  align-items: flex-start;
                ">
                <el-input v-model="fontLibInfo.projectPath" placeholder="请导入keil工程的路径" clearable
                  style="width: 350px; margin-right: 5px" :disabled="enableImportProjectPath ? false : ''"
                  @clear="onHandleProjectPathClear" />
                <el-button type="primary" @click="onChangeProjectPath"
                  :disabled="enableImportProjectPath ? false : ''">选择</el-button>
                <!-- 提示 -->
                <el-popover placement="bottom" :width="900" trigger="hover">
                  <template #reference>
                    <div style="
                        width: 20px;
                        height: 20px;
                        margin: 11px 0px 0px 8px;
                        color: #a9b5c0;
                      ">
                      <InfoFilled />
                    </div>
                  </template>

                  <template #default>
                    <div class="popover-Img"></div>
                  </template>
                </el-popover>
                <!-- 选择框 -->
                <el-checkbox style="margin-left: 18px; margin-top: 3px" v-model="enableImportProjectPath" label="请勾选"
                  size="large" />
              </div>
            </el-form-item>

            <el-form-item v-if="fontLibInfo.compilerVersion === 'IAR'">
              <template #label>
                <span >工程路径:</span>
              </template>
              <div style="
                  display: flex;
                  justify-content: center;
                  align-items: flex-start;
                ">
                <el-input v-model="fontLibInfo.projectPath" placeholder="请导入IAR工程的路径" clearable
                  style="width: 350px; margin-right: 5px" 
                  @clear="onHandleIARProjectPathClear" />
                <el-button type="primary" @click="onChangeIARProjectPath">选择</el-button>
                <!-- 提示 -->
                <el-popover placement="bottom" :width="600" trigger="hover">
                  <template #reference>
                    <div style="
                        width: 20px;
                        height: 20px;
                        margin: 11px 0px 0px 8px;
                        color: #a9b5c0;
                      ">
                      <InfoFilled />
                    </div>
                  </template>

                  <template #default>
                    <div class="popover-img_iar"></div>
                  </template>
                </el-popover>
              </div>
            </el-form-item>
            <el-form-item v-if="fontLibInfo.compilerVersion === 'IAR'" label="编译配置:">
              <el-select
                style="width: 350px;"
                v-model="fontLibInfo.iarConfiguration"
                placeholder="请选择IAR configuration"
                clearable
              >
                <el-option
                  v-for="item in iarConfigurations"
                  :key="item"
                  :label="item"
                  :value="item"
                />
              </el-select>
            </el-form-item>
            
            <!-- gcc 专属：gcc/ar 执行文件路径 -->
            <el-form-item v-if="fontLibInfo.compilerVersion === 'GCC'" label="gcc执行文件:">
              <div style="display:flex;align-items:center;gap:8px;">
                <el-input v-model="gccInfo.gccName" placeholder="示例: /path/bin/xtensa-esp32s3-elf-gcc.exe" style="width:350px;" />
                <el-button type="primary" @click="onSelectGccPath('gccName')">选择</el-button>
                <el-popover placement="bottom" :width="920" trigger="hover">
                  <template #reference>
                    <div style="
                        width: 20px;
                        height: 20px;
                        margin: 11px 0px 0px 8px;
                        color: #a9b5c0;
                      ">
                      <InfoFilled />
                    </div>
                  </template>
                  <template #default>
                    <el-scrollbar max-height="560px">
                      <div class="gcc-guide-content">
                        <p>这里以 <b>ESP32-S3</b> 芯片、<b>ESP-IDF</b> 开发框架为例。</p>

                        <h4>一、自行确认芯片相关信息</h4>
                        <table class="gcc-guide-table">
                          <tbody>
                            <tr>
                              <th>项目</th>
                              <th>说明</th>
                            </tr>
                            <tr>
                              <td>芯片型号</td>
                              <td>ESP32-S3</td>
                            </tr>
                            <tr>
                              <td>芯片架构</td>
                              <td>Xtensa</td>
                            </tr>
                            <tr>
                              <td>开发框架</td>
                              <td>ESP-IDF</td>
                            </tr>
                            <tr>
                              <td>工具链</td>
                              <td><code>xtensa-esp32s3-elf-gcc</code></td>
                            </tr>
                          </tbody>
                        </table>

                        <h4>二、工具链执行文件查找指引</h4>
                        <div v-for="(step, index) in gccGuideSteps" :key="step.title" class="gcc-guide-step-block">
                          <div class="gcc-guide-step-text">
                            {{ index + 1 }}. {{ step.title }}
                          </div>
                          <div class="gcc-guide-images">
                            <div v-for="item in step.images" :key="item.title" class="gcc-guide-image-item">
                              <div class="gcc-guide-image-title">{{ item.title }}</div>
                              <el-image
                                :src="item.src"
                                :preview-src-list="gccEsp32GuidePreviewList"
                                fit="contain"
                                class="gcc-guide-image"
                              >
                                <template #error>
                                  <div class="gcc-guide-image-error">图片加载失败，请检查图片路径</div>
                                </template>
                              </el-image>
                            </div>
                          </div>
                        </div>
                      </div>
                    </el-scrollbar>
                  </template>
                </el-popover>
              </div>
            </el-form-item>
            <el-form-item v-if="fontLibInfo.compilerVersion === 'GCC'" label="ar执行文件:">
              <div style="display:flex;align-items:center;gap:8px;">
                <el-input v-model="gccInfo.arName" placeholder="示例: /path/bin/xtensa-esp32s3-elf-ar.exe" style="width:350px;" />
                <el-button type="primary" @click="onSelectGccPath('arName')">选择</el-button>
              </div>
            </el-form-item>

            <el-form-item label="驱动C文件路径:" v-if="activate">
              <div style="
                  display: flex;
                  justify-content: center;
                  align-items: flex-start;
                ">
                <el-input v-model="fontLibInfo.driverCPath" placeholder="请导入驱动c文件" clearable
                  style="width: 350px; margin-right: 5px" />
                <el-button type="primary" @click="onChangeDriverCPath">选择</el-button>
              </div>
            </el-form-item>
            <el-form-item label="驱动H文件路径:" v-if="activate">
              <div style="
                  display: flex;
                  justify-content: center;
                  align-items: flex-start;
                ">
                <el-input v-model="fontLibInfo.driverHPath" placeholder="请导入驱动h文件" clearable
                  style="width: 350px; margin-right: 5px" />
                <el-button type="primary" @click="onChangeDriverHPath">选择</el-button>
                <el-tooltip 
                  content="H文件路径名要和C文件名一致" 
                  placement="bottom"
                  effect="dark">
                  <div style="
                      width: 20px;
                      height: 20px;
                      margin: 11px 0px 0px 8px;
                      color: #a9b5c0;
                      cursor: pointer;
                    ">
                    <InfoFilled />
                  </div>
                </el-tooltip>
              </div>
            </el-form-item>
            <el-form-item>
              <template #label>
                <span @dblclick.stop="activateStepOne" @click.stop>库文件生成路径:</span>
              </template>
              <div style="
                  display: flex;
                  justify-content: center;
                  align-items: flex-start;
                ">
                <el-input v-model="fontLibInfo.libPath" placeholder="请导入库文件生成路径" clearable
                  style="width: 350px; margin-right: 5px" />
                <el-button type="primary" @click="onChangeLibPath">选择</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-card>
        <!-- 卡片部分 -->
        <el-card shadow="never">
          <div class="Card-Header">
            <!-- ARM处理器参数: -->
            <el-col :span="12" v-if="isKeil && fontLibInfo.mcuArch === 'ARM'">
              <!-- <p>ARM处理器参数:</p> -->
              <div style="margin-bottom: 5px">ARM处理器参数:</div>
              <el-card shadow="hover">
                <!-- 表单部分 -->
                <el-form ref="formRef" :model="numberValidateForm" label-width="120px" class="demo-ruleForm">
                  <!-- 编译器内核版本 -->
                  <el-form-item label="编译器内核版本:" v-if="fontLibInfo.compilerVersion == 'Keil5'">
                    <el-select v-model="armInfo.kernelVersion" placeholder="请选择编译器内核版本" @change="onChangeKernelVersion">
                      <el-option v-for="item in optionsCompiler" :key="item.value" :label="item.label"
                        :value="item.value" />
                    </el-select>
                  </el-form-item>
                  <!-- MCu内核类型 -->
                  <el-form-item label="MCU内核类型:">
                    <el-select v-model="armInfo.mcuType" placeholder="请选择MCU内核类型" @change="onChangeMcuType">
                      <el-option v-for="item in getOptionsForARM()" :key="item.value" :label="item.label"
                        :value="item.value" />
                    </el-select>
                  </el-form-item>
                  <!-- 优化等级 -->
                  <el-form-item label="优化等级:">
                    <el-select v-model="armInfo.optimizationLevel" placeholder="请选择优化等级">
                      <el-option v-if="armInfo.kernelVersion == 0" v-for="item in optimizationAC5" :key="item.value"
                        :label="item.label" :value="item.value" />
                      <el-option v-if="armInfo.kernelVersion == 1" v-for="item in optimizationAC6" :key="item.value"
                        :label="item.label" :value="item.value" />
                    </el-select>
                  </el-form-item>
                  <!-- 单选框 -->
                  <el-form-item prop="type">
                    <!-- 共有 -->
                    <el-checkbox v-model="armInfo.microLib" label="MicroLib" name="type" />
                    <!-- AC5 -->
                    <el-checkbox v-if="armInfo.kernelVersion == 0" v-model="armInfo.strictANSI" label="Strict ANSI C"
                      name="type" />
                    <!-- AC5 -->
                    <el-checkbox v-if="armInfo.kernelVersion == 0" v-model="armInfo.enum"
                      label="Enum Container always int" name="type" />
                    <!-- AC5 -->
                    <el-checkbox v-if="armInfo.kernelVersion == 0" v-model="armInfo.uC99" label="uC99" name="type" />
                    <!-- AC5 -->
                    <el-checkbox v-if="armInfo.kernelVersion == 0" v-model="armInfo.uGnu" label="uGnu" name="type" />
                    <!-- 共有 -->
                    <el-checkbox v-model="armInfo.oneELF" label="OneELF Section per Function" name="type" />
                  </el-form-item>
                  <!-- compiler mode -->
                  <!-- AC6 -->
                  <el-form-item label="compiler mode:" v-if="armInfo.kernelVersion == 1">
                    <el-select v-model="armInfo.compilerMode" placeholder="请选择compiler mode">
                      <el-option v-for="item in compilerMode" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
            <!-- 51处理器参数部分 -->
            <el-col :span="12" v-if="isKeil && fontLibInfo.mcuArch === '51'">
              <!-- <p>51处理器参数:</p> -->
              <div style="margin-bottom: 5px">51处理器参数:</div>
              <el-card shadow="hover">
                <!-- 表单部分 -->
                <el-form ref="formRef" :model="numberValidateForm" label-width="150px" class="demo-ruleForm">
                  <!-- MCU内核类型 -->
                  <el-form-item label="MCU内核类型:">
                    <el-select v-model="c51Info.mcuType" placeholder="请选择MCU内核类型" filterable default-first-option
                      clearable no-match-text="目前没该MCU内核类型!">
                      <el-option v-for="item in optionsMCU" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                  </el-form-item>
                  <!-- Memory Model -->
                  <el-form-item label="Memory Model:">
                    <el-select v-model="c51Info.memoryModel" placeholder="请选择Memory Model">
                      <el-option v-for="item in optionsMemoryModel" :key="item.value" :label="item.label"
                        :value="item.value" />
                    </el-select>
                  </el-form-item>
                  <!--Code Rom Size  -->
                  <el-form-item label="Code Rom Size:">
                    <el-select v-model="c51Info.codeRomSize" placeholder="请选择Code Rom Size">
                      <el-option v-for="item in optionsCodeRomSize" :key="item.value" :label="item.label"
                        :value="item.value" />
                    </el-select>
                  </el-form-item>
                  <!-- OPerating system -->
                  <el-form-item label="OPerating system:">
                    <el-select v-model="c51Info.operatingSystem" placeholder="请选择OPerating system">
                      <el-option v-for="item in optionsOperatingSystem" :key="item.value" :label="item.label"
                        :value="item.value" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
            <!-- GCC编译参数: -->
            <el-col :span="18" v-if="fontLibInfo.compilerVersion === 'GCC'">
              <div style="margin-bottom: 5px">GCC编译参数:</div>
              <el-card shadow="hover">
                <el-form label-width="150px">
                  <el-form-item label="CPU架构(-mcpu):">
                    <el-select allow-create filterable default-first-option v-model="gccInfo.arch" clearable placeholder="用于配置'-mcpu='" style="width:250px;">
                      <el-option v-for="item in gccCpuList" :key="item" :label="item" :value="item" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="C语言标准(-std):">
                    <el-select allow-create filterable default-first-option v-model="gccInfo.std" clearable placeholder="用于配置'-std='" style="width:250px;">
                      <el-option v-for="item in gccStdList" :key="item" :label="item" :value="item" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="浮点(-mfloat-abi):">
                    <el-select allow-create filterable default-first-option v-model="gccInfo.floatType" clearable  placeholder="用于配置'-mfloat-abi='" style="width:250px;">
                      <el-option v-for="item in gccFloatTypeList" :key="item" :label="item" :value="item" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="优化等级:">
                    <el-select allow-create filterable default-first-option v-model="gccInfo.optimization" clearable placeholder="用于配置'-O'" style="width:250px;">
                      <el-option v-for="item in gccOptimizationList" :key="item" :label="item" :value="item" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="自定义编译选项:">
                    <el-input v-model="gccInfo.compileText" placeholder="编译选项之间用空格隔开,例:-mthumb -mlongcalls" style="width:350px;" />
                    <div style="margin-top:6px;">
                      <el-checkbox v-model="gccInfo.isMthumb">-mthumb</el-checkbox>
                      <el-checkbox v-model="gccInfo.isWpointerArith">-Wpointer-arith</el-checkbox>
                      <el-checkbox v-model="gccInfo.isMlongcalls">-mlongcalls</el-checkbox>
                    </div>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
          </div>
          <!-- 提交按钮 -->
          <div class="button-submit">
            <el-button size="large" type="primary" round style="width: 200px" @click="generateLib">生成文件</el-button>
          </div>
        </el-card>
        <!-- 提示部分 -->
        <el-card shadow="never" style="margin-top: 5px;">
          <el-row>
            <el-col :span="10" style="margin-right: 50px;">
              <!-- 左边 -->
              <div style="font-weight: 600;">公告：</div>

              <div style="font-size: 14px;">
                &nbsp&nbsp&nbsp&nbsp&nbsp请确认芯片下方批次号（类似2130Z）。若前四位小于2240，可能无法使用MindCraftAI自动库Lib助手生成的SDK库文件。请联系销售或技术人员获取相应SDK库文件。我们客服团队随时为您提供支持。
              </div>
              <div class="chip_img"></div>
            </el-col>
            <el-col :span="12">
              <!-- 右边 -->
              <div><span style="font-weight: 600;">联系方式：</span></div>
                  <div class="fontSize_All">电话： 0775-83453881</div>
                  <div class="fontSize_All">邮箱：<el-link type="primary">sales@genitop.com</el-link></div>
                  <div class="fontSize_All" style="margin-bottom: 20px;">官方网站：http://www.hmi.gaotongfont.cn</div>
                  <div class="HMI_img"></div>
                  <p>高通GT-HMI交流群</p>
            </el-col>
          </el-row>
        </el-card>
      </div>
      <!-- 弹窗 -->
      <el-dialog v-model="centerDialogVisible" title="提示" width="600" center draggable>
        <!-- <span>
        <el-alert title="已成功生成文件" type="success" show-icon :closable="false" />
      </span> -->
        <el-result icon="success" title="生成文件成功！" :sub-title="saveFilePath">

          <template #extra>
            <el-button type="primary" icon="FolderOpened" @click="openFile">打开生成文件</el-button>
          </template>
        </el-result>
      </el-dialog>
    </div>
  </div>
</template>

<script setup>
import sidebar from "@/views/application/components/sidebar.vue";
import { reactive, ref, onMounted, watch,computed } from "vue";
import api from "@/utils/request";
import xmlUtils from "@/utils/xml";
import { useActivate } from "@/hook/useDevMode/activate";
const { initStep, activateStepOne, activateStepTwo, activateStepThree, activateStepFour,activateStepFive, activate } = useActivate()
import uncompressFile from "@/utils/zip";
import encrypt from "@/utils/encrypt";
// import execKeilCmd from "@/utils/lib";
import joint from "@/utils/prj";
import { ElMessage } from "element-plus";
import { userApprovalFormStore } from '@/stores/ApprovalForm.js';
import {callRecord} from '@/api/application/font_lab.js'

const formRef = ref(); //表单实例
const numberValidateForm = ref(); //表单model
const enableImportProjectPath = ref(true);
const fontList = ref([]);
const spannedFileLoading = ref(false); //生成文件Loading
const centerDialogVisible = ref(false); //生成文件 成功的弹窗
const saveFilePath = ref(""); //保存文件路径
const iarConfigurations = ref([]);
const approvalFormStore = userApprovalFormStore()
let intervalId = null;

//生成字库lib相关信息
const fontLibInfo = reactive({
  mcuArch: "ARM",
  font: "",
  compilerVersion: "Keil5",
  compilerPath: "",
  projectPath: "",
  libPath: "",
  driverCPath: "",
  driverHPath: "",
  iarConfiguration: "",
});
// 回显
fontLibInfo.mcuArch = approvalFormStore.fontlibraryList.mcuArch || "ARM";
fontLibInfo.compilerVersion = approvalFormStore.fontlibraryList.compilerVersion || "Keil5";
fontLibInfo.compilerPath = approvalFormStore.fontlibraryList.compilerPath;
fontLibInfo.projectPath = approvalFormStore.fontlibraryList.projectPath;
fontLibInfo.libPath = approvalFormStore.fontlibraryList.libPath;
fontLibInfo.font = approvalFormStore.fontlibraryList.font
fontLibInfo.driverCPath = approvalFormStore.fontlibraryList.driverCPath;
fontLibInfo.driverHPath = approvalFormStore.fontlibraryList.driverHPath;
fontLibInfo.iarConfiguration = approvalFormStore.fontlibraryList.iarConfiguration || "";

watch(()=>activate.value, (val) => {
   fontLibInfo.driverCPath = ''
    fontLibInfo.driverHPath = ''
},{deep:true,immediate:true})

// ARM处理器参数，分为AC5,AC6
const armInfo = reactive({
  mcuType: "", //MCU内核类型        //共有
  kernelVersion: "0", //编译器内核版本     //共有
  optimizationLevel: "", //优化等级          //共有    AC6多几个选项
  compilerMode: "", //compiler mode    //AC6
  // 单选框
  microLib: false, //共有
  strictANSI: false, //AC5
  enum: false, //AC5
  oneELF: false, //共有
  uC99: false, //AC5
  uGnu: false, //AC5
});

// 51处理器参数部分
const c51Info = reactive({
  mcuType: "", //MCU内核类型
  memoryModel: "", //Memory Model
  codeRomSize: "", //Code Rom Size
  operatingSystem: "", //OPerating system
});

// GCC编译参数
const gccInfo = reactive({
  gccName: '',
  arName: '',
  arch: '',
  std: '',
  floatType: '',
  optimization: '',
  compileText: '',
  isMthumb: false,
  isWpointerArith: false,
  isMlongcalls: false,
})
// 回显 gcc 路径
gccInfo.gccName = approvalFormStore.fontlibraryList.gccName || ''
gccInfo.arName = approvalFormStore.fontlibraryList.arName || ''

const gccCpuList = ['-','cortex-m0', 'cortex-m0plus', 'cortex-m3', 'cortex-m4', 'cortex-m7', 'cortex-m33']
const gccStdList = ['-','c89', 'c99', 'c11', 'gnu89', 'gnu99', 'gnu11']
const gccFloatTypeList = ['-','soft', 'softfp', 'hard']
const gccOptimizationList = ['-','-O0', '-O1', '-O2', '-O3', '-Os']

const gccGuideSteps = [
  {
    title: '在 ESP-IDF 框架安装目录下，找到 tools 文件夹，进入后找到 xtensa-esp32-elf 文件夹。',
    images: [
      { title: '步骤1-定位 tools 目录(1)', src: new URL('../../../assets/lib-gcc/image.png', import.meta.url).href },
      { title: '步骤1-定位 tools 目录(2)', src: new URL('../../../assets/lib-gcc/image-3.png', import.meta.url).href },
    ],
  },
  {
    title: '进入 xtensa-esp32-elf 文件夹后，找到 bin 文件夹，进入后即可看到对应的 gcc 和 ar 执行文件。',
    images: [
      { title: '步骤2-进入 bin 目录(1)', src: new URL('../../../assets/lib-gcc/image-2.png', import.meta.url).href },
      { title: '步骤2-进入 bin 目录(2)', src: new URL('../../../assets/lib-gcc/image-5.png', import.meta.url).href },
    ],
  },
  {
    title: '在 MindCraft 中对应填入这两个执行文件即可。',
    images: [
      { title: '步骤3-MindCraft 填写示意', src: new URL('../../../assets/lib-gcc/image-6.png', import.meta.url).href },
    ],
  },
]
const gccEsp32GuidePreviewList = gccGuideSteps.flatMap((step) => step.images.map((item) => item.src))
 
/**************************************************获取字库包***********************************************************************/ 

onMounted(async () => {
  await getFontList();
  if (fontLibInfo.compilerVersion === 'IAR' && fontLibInfo.projectPath && fontLibInfo.projectPath.toString().endsWith('.ewp')) {
    try {
      await loadIarConfigurations(fontLibInfo.projectPath);
    } catch (error) {
      console.log(error);
      resetIarConfigurationState();
    }
  }
});

/**
 * 获取ARM字库列表
 */
const getFontListArm = async () => {
  try {
    const list = [];
    const response = await api.get("/autoBuildLib/font_list/");
    if (response.status === 200) {
      const fontsInfo = response.data;
      for (var i = 0; i < fontsInfo.length; i++) {
        if (fontsInfo[i].mcu != "ARM") {
          continue;
        }
        list.push(fontsInfo[i].font_name);
      }
      //去重
      fontList.value = [...new Set(list)];
    }
  } catch (error) {
    console.log(error);
  }
};

/**
 * 获取51字库列表
 */
const getFontListC51 = async () => {
  try {
    const list = [];
    const response = await api.get("/autoBuildLib/font_list/");
    if (response.status === 200) {
      const fontsInfo = response.data;
      for (var i = 0; i < fontsInfo.length; i++) {
        if (fontsInfo[i].mcu != "51") {
          continue;
        }
        list.push(fontsInfo[i].font_name);
      }
      //去重
      fontList.value = [...new Set(list)];
    }
  } catch (error) {
    console.log(error);
  }
};

const getFontList = async () => {
  if (fontLibInfo.mcuArch === "ARM") {
    await getFontListArm();
  } else {
    await getFontListC51();
  }
};

/**
 * 下载服务器对应字库源文件压缩包
 * @param mcu
 * @param fontName
 * @param zipPath 字库源文件压缩包存放路径
 */
const downloadFontFile = async (mcu, fontName, zipPath) => {
  try {
    const response = await api.get(
      `/autoBuildLib/download_font_file/${mcu}/${fontName}/`,
      { responseType: "arraybuffer" }
    );
    const buffer = await joint.createBuffer(response.data); // 将ArrayBuffer转换为Buffer
    await joint.writeFileSync(zipPath, buffer);
    // console.log(
    //   "[SUCCESS]---------->Font file downloaded and saved to:",
    //   zipPath
    // );
  } catch (error) {
    console.error("[ERROR]---------->Error downloading font file:", error);
    ElMessage.error(`${mcu}处理器没有${fontName}这个字库型号`);
    throw error;
  }
};
/****************************************IAR相关*******************************************/
const resetIarConfigurationState = () => {
  iarConfigurations.value = [];
  fontLibInfo.iarConfiguration = "";
};

const loadIarConfigurations = async (projectPath) => {
  const obj = await xmlUtils.getObjFromXML(projectPath);
  const configurationNames = await xmlUtils.getIarConfigurationNames(obj);
  iarConfigurations.value = configurationNames;
  if (!configurationNames.length) {
    fontLibInfo.iarConfiguration = "";
    ElMessage.warning("当前IAR工程未找到可用configuration");
    return;
  }
  if (!configurationNames.includes(fontLibInfo.iarConfiguration)) {
    fontLibInfo.iarConfiguration = configurationNames[0];
  }
};
/*************************************************keil相关***********************************************************/ 
const isKeil = computed(()=>fontLibInfo.compilerVersion === 'Keil4' || fontLibInfo.compilerVersion === 'Keil5')

const onChangeMcuArch = async () => {
  if(fontLibInfo.compilerVersion ==='IAR'){
    fontLibInfo.compilerVersion = 'Keil5'
  }
  fontLibInfo.compilerPath = "";
  fontLibInfo.projectPath = "";
  await getFontList();

  //clean information about old project
  cleanArmInfo();
  cleanC51Info();
  cleanGccInfo();
  resetIarConfigurationState();
};

const onChangeCompilerVersion = async () => {
  //Keil4,ARM处理器参数与Keil5界面一样
  if (fontLibInfo.compilerVersion === "Keil4" && fontLibInfo.mcuArch === "ARM") {
    armInfo.kernelVersion = "0"
  }
  fontLibInfo.compilerPath = "";
  fontLibInfo.projectPath = "";

  //clean information about old project
  cleanArmInfo();
  cleanC51Info();
  cleanGccInfo();
  resetIarConfigurationState();
};

// 本地编译器路径
const onChangeCompilerPath = async () => {
  try {
    const selectedPath = await joint.openFileDialog({ type: "file"});
    if (selectedPath) {
      fontLibInfo.compilerPath = selectedPath;
    }
  } catch (error) {
    console.log(error);
  }
};

const cleanArmInfo = async () => {
  armInfo.kernelVersion = "";
  armInfo.mcuType = "";
  armInfo.optimizationLevel = "";
  armInfo.compilerMode = "";
  armInfo.microLib = false;
  armInfo.oneELF = false;
  armInfo.strictANSI = false;
  armInfo.enum = false;
  armInfo.uC99 = false;
  armInfo.uGnu = false;
};

const cleanC51Info = async () => {
  c51Info.mcuType = "";
  c51Info.memoryModel = "";
  c51Info.codeRomSize = "";
  c51Info.operatingSystem = "";
};

const cleanGccInfo = () => {
  gccInfo.gccName = ''
  gccInfo.arName = ''
  gccInfo.arch = ''
  gccInfo.std = ''
  gccInfo.floatType = ''
  gccInfo.optimization = ''
  gccInfo.compileText = ''
  gccInfo.isMthumb = false
  gccInfo.isWpointerArith = false
  gccInfo.isMlongcalls = false
}

const onSelectGccPath = async (field) => {
  try {
    const selectedPath = await joint.openFileDialog({ type: 'file' })
    if (selectedPath) {
      const ext = selectedPath.toString().split('.').pop()
      gccInfo[field] = ext && ext !== selectedPath ? selectedPath.replace(`.${ext}`, '') : selectedPath
    }
  } catch (error) {
    console.log(error)
  }
}

const loadingArmKeil5ProjectInfo = async (obj) => {
  //AC5与AC6共有参数
  armInfo.kernelVersion = await xmlUtils.getKernelVersion(obj);
  armInfo.mcuType = await xmlUtils.getArmCpu(obj);
  armInfo.optimizationLevel = await xmlUtils.getOptimization(obj);
  armInfo.microLib = (await xmlUtils.getMicroLib(obj)) == "1" ? true : false;
  armInfo.oneELF = (await xmlUtils.getOneEIfS(obj)) == "1" ? true : false;
  //AC5
  if (armInfo.kernelVersion === "0") {
    armInfo.strictANSI = (await xmlUtils.getStrict(obj)) == "1" ? true : false;
    armInfo.enum = (await xmlUtils.getEnumInt(obj)) == "1" ? true : false;
    armInfo.uC99 = (await xmlUtils.getUc99(obj)) == "1" ? true : false;
    armInfo.uGnu = (await xmlUtils.getUgnu(obj)) == "1" ? true : false;
  } else if (armInfo.kernelVersion === "1") {
    armInfo.compilerMode = await xmlUtils.getV6Lang(obj);
  }
};

const loadingArmKeil4ProjectInfo = async (obj) => {
  armInfo.mcuType = await xmlUtils.getArmCpu(obj);
  armInfo.optimizationLevel = await xmlUtils.getOptimization(obj);
  armInfo.microLib = (await xmlUtils.getMicroLib(obj)) == "1" ? true : false;
  armInfo.oneELF = (await xmlUtils.getOneEIfS(obj)) == "1" ? true : false;
  armInfo.strictANSI = (await xmlUtils.getStrict(obj)) == "1" ? true : false;
  armInfo.enum = (await xmlUtils.getEnumInt(obj)) == "1" ? true : false;
  armInfo.uC99 = (await xmlUtils.getKeil4Uc99Status(obj));
  armInfo.uGnu = (await xmlUtils.getKeil4UgnuStatus(obj));
};

const loadingArmProjectInfo = async (obj) => {
  if (fontLibInfo.compilerVersion === "Keil5") {
    await loadingArmKeil5ProjectInfo(obj);
  } else {
    await loadingArmKeil4ProjectInfo(obj);
  }
};

const loadingC51ProjectInfo = async (obj) => {
  c51Info.mcuType = await xmlUtils.getC51Cpu(obj);
  c51Info.memoryModel = await xmlUtils.getMemoryModel(obj);
  c51Info.codeRomSize = await xmlUtils.getRomSize(obj);
  c51Info.operatingSystem = await xmlUtils.getRtos(obj);
};

/**
 * 通过keil工程文件加载工程信息
 */
const loadingProjectInfo = async (path) => {
  //clean information about old project
  cleanArmInfo();
  cleanC51Info();
  var obj = null;

  fontLibInfo.projectPath = path;
  obj = await xmlUtils.getObjFromXML(fontLibInfo.projectPath);
  // console.log('obj', obj);

  if (fontLibInfo.mcuArch === "ARM") {
    await loadingArmProjectInfo(obj);
  } else {
    await loadingC51ProjectInfo(obj);
  }
};

/**
 * 设置Keil5工程 ARM处理器参数
 * @param obj 工程的json对象
 */
const setArmKeil5ProjectInfo = async (obj) => {
  //编译器内核版本kernelVersion，mcu内核类型不用设置mcuType
  await xmlUtils.setOptimization(obj, armInfo.optimizationLevel);
  await xmlUtils.setMicroLib(obj, armInfo.microLib);
  await xmlUtils.setOneEIfS(obj, armInfo.oneELF); //字库可能需要设置这一项
  //AC5
  if (armInfo.kernelVersion === "0") {
    await xmlUtils.setStrict(obj, armInfo.strictANSI);
    await xmlUtils.setEnumInt(obj, armInfo.enum);
    await xmlUtils.setUc99(obj, armInfo.uC99); //字库可能需要设置这一项
    await xmlUtils.setUgnu(obj, armInfo.uGnu); //字库可能需要设置这一项
  } else if (armInfo.kernelVersion === "1") {
    await xmlUtils.setV6Lang(obj, armInfo.compilerMode);
  }
  console.log("-----------更新了ARM Keil5 处理器参数---------------");
};

/**
 * 设置Keil4工程 ARM处理器参数
 * @param obj 工程的json对象
 */
const setArmKeil4ProjectInfo = async (obj) => {
  //编译器内核版本kernelVersion，mcu内核类型不用设置mcuType
  await xmlUtils.setOptimization(obj, armInfo.optimizationLevel);
  await xmlUtils.setMicroLib(obj, armInfo.microLib);
  await xmlUtils.setOneEIfS(obj, armInfo.oneELF); //字库可能需要设置这一项
  await xmlUtils.setStrict(obj, armInfo.strictANSI);
  await xmlUtils.setEnumInt(obj, armInfo.enum);
  await xmlUtils.setKeil4Uc99Status(obj, armInfo.uC99); //字库可能需要设置这一项
  await xmlUtils.setKeil4UgnuStatus(obj, armInfo.uGnu);

  console.log("-----------更新了ARM Keil4 处理器参数---------------");
};

const setArmProjectInfo = async (obj) => {
  if (fontLibInfo.compilerVersion == "Keil5") {
    await setArmKeil5ProjectInfo(obj);
  } else {
    await setArmKeil4ProjectInfo(obj);
  }
};

/**
 * 设置Keil5/Keil4 工程 51处理器参数
 * @param obj 工程的json对象
 */
const setC51ProjectInfo = async (obj) => {
  await xmlUtils.setC51Cpu(obj, c51Info.mcuType);
  await xmlUtils.setMemoryModel(obj, c51Info.memoryModel);
  await xmlUtils.setRomSize(obj, c51Info.codeRomSize);
  await xmlUtils.setRtos(obj, c51Info.operatingSystem);
  console.log("------------更新了C51处理器参数----------------");
};

/**
 * 设置导入的工程参数到新建的keil工程里
 * @param keilPath keil工程路径
 */
const setProjectInfo = async (keilPath) => {
  var obj = await xmlUtils.getObjFromXML(keilPath);
  if (fontLibInfo.mcuArch === "ARM") {
    await setArmProjectInfo(obj);
  } else {
    await setC51ProjectInfo(obj);
  }
  await xmlUtils.writeXML(keilPath, obj);

  console.log("[SUCCESS]---------->把工程参数写入Keil工程");
};

/**
 * 工程参数一键导入  keil4或keil5
 */
const onChangeProjectPath = async () => {
  try {
    const selectedPath = await joint.openFileDialog({ type: "file",filters: [
    { name: '工程文件', extensions: ['uvprojx','uvproj'] }]});
    if (selectedPath) {
      await loadingProjectInfo(selectedPath);
    }
  } catch (error) {
    console.log(error);
  }
};
/** 
 * 工程路径 IAR
 */
const onChangeIARProjectPath = async () => {
  try {
    const selectedPath = await joint.openFileDialog({ type: "file", filters: [
    { name: '工程文件', extensions: ['ewp'] }
  ] });
    if (selectedPath) {
      fontLibInfo.projectPath =  selectedPath
      await loadIarConfigurations(selectedPath);
    }
  }catch(error){
    console.log(error)
  }
}



const onHandleProjectPathClear = async () => {
  if (fontLibInfo.mcuArch == "ARM") {
    cleanArmInfo();
  } else {
    cleanC51Info();
  }
};
const onHandleIARProjectPathClear = async () => {
  resetIarConfigurationState();
};
/**
 * 库文件生成路径
 */
const onChangeLibPath = async () => {
  try {
    const selectedPath = await joint.openFileDialog({ type: "directory" });
    if (selectedPath) {
      fontLibInfo.libPath = selectedPath;
    }
  } catch (error) { }
};

// 驱动C文件路径
const onChangeDriverCPath = async () => {
  try {
    const selectedPath = await joint.openFileDialog({ type: "file" });
    if (selectedPath) {
      fontLibInfo.driverCPath = selectedPath;
    }
  } catch (error) {
    console.log(error);
  }
};

// 驱动H文件路径
const onChangeDriverHPath = async () => {
  try {
    const selectedPath = await joint.openFileDialog({ type: "file" });
    if (selectedPath) {
      fontLibInfo.driverHPath = selectedPath;
    }
  } catch (error) {
    console.log(error);
  }
};

const onChangeKernelVersion = async () => {
  if (armInfo.mcuType == "Cortex-M33") {
    armInfo.kernelVersion = "1"; //M33 只有AC6有
  }
};

const getOptionsForARM = () => {
  var options = []
  if (fontLibInfo.compilerVersion === "Keil5") {
    options = optionsARM
  } else if (fontLibInfo.compilerVersion === "Keil4") {
    options = optionsKeil4ARM
  }
  return options
};

const onChangeMcuType = async () => {
  if (armInfo.mcuType == "Cortex-M33") {
    armInfo.kernelVersion = "1"; //M33 只有AC6有
  }
};

/**
 * 生成ARM Keil5工程,工程后缀lib.uvprojx
 * @param path  编译工程的根目录
 * @return filePath 工程文件的路径
 */
const generateArmKeil5Project = async (path) => {
  var data = null;
  //ARM AC5 is 0
  if (armInfo.kernelVersion == "0") {
    switch (armInfo.mcuType) {
      case "Cortex-M0":
        data = await xmlUtils.generateAC5M0XmlContext();
        break;

      case "Cortex-M0+":
        data = await xmlUtils.generateAC5M0PlusXmlContext();
        break;

      case "Cortex-M3":
        data = await xmlUtils.generateAC5M3XmlContext();
        break;

      case "Cortex-M33":
        data = await xmlUtils.generateAC6M33XmlContext();
        break;

      case "Cortex-M4":
        data = await xmlUtils.generateAC5M4XmlContext();
        break;

      case "Cortex-M7":
        data = await xmlUtils.generateAC5M7XmlContext();
        break;
    }
  } else {
    switch (armInfo.mcuType) {
      case "Cortex-M0":
        data = await xmlUtils.generateAC6M0XmlContext();
        break;

      case "Cortex-M0+":
        data = await xmlUtils.generateAC6M0PlusXmlContext();
        break;

      case "Cortex-M3":
        data = await xmlUtils.generateAC6M3XmlContext();
        break;

      case "Cortex-M33":
        data = await xmlUtils.generateAC6M33XmlContext();
        break;

      case "Cortex-M4":
        data = await xmlUtils.generateAC6M4XmlContext();
        break;

      case "Cortex-M7":
        data = await xmlUtils.generateAC6M7XmlContext();
        break;
    }
  }

  var filePath = await joint.join(path, "lib.uvprojx");
  await joint.writeFileSync(filePath, data);
  // console.log("keil5 arm keilPath", filePath);

  return filePath;
};

/**
 * 生成C51 Keil5 工程，工程后缀lib.uvproj，需多生成启动文件STARTUP.A51
 * @param path 编译工程的根目录
 * @return filePath 工程文件的路径
 */
const generateC51Keil5Project = async (path) => {
  var data = null;
  var startupData = null;
  data = await xmlUtils.generateC51XmlContext();
  var filePath = await joint.join(path, "lib.uvproj");
  await joint.writeFileSync(filePath, data);
  startupData = await xmlUtils.generateStartupContext();
  var startupPath = await joint.join(path, "STARTUP.A51");
  await joint.writeFileSync(startupPath, startupData);

  console.log("keil5 c51 keilPath", filePath);

  return filePath;
};

/**
 * 生成ARM Keil4工程，工程后缀lib.uvproj
 * @param path  编译工程的根目录
 * @return filePath 工程文件的路径
 */
const generateArmKeil4Project = async (path) => {
  var data = null;
  switch (armInfo.mcuType) {
    case "Cortex-M0":
      data = await xmlUtils.generateKeil4M0XmlContext();
      break;
    case "Cortex-M0+":
      data = await xmlUtils.generateKeil4M0PlusXmlContext();
      break;
    case "Cortex-M1":
      data = await xmlUtils.generateKeil4M1XmlContext();
      break;
    case "Cortex-M3":
      data = await xmlUtils.generateKeil4M3XmlContext();
      break;
    case "Cortex-M4":
      data = await xmlUtils.generateKeil4M4XmlContext();
      break;
  }

  var filePath = await joint.join(path, "lib.uvproj");
  await joint.writeFileSync(filePath, data);
  console.log("keil4 arm keilPath", filePath);

  return filePath
};

/**
 * 生成C51 Keil4工程，工程后缀lib.uvproj，需多生成启动文件STARTUP.A51
 * @param path  编译工程的根目录
 * @return filePath 工程文件的路径
 */
const generateC51Keil4Project = async (path) => {
  var data = null;
  var startupData = null;
  data = await xmlUtils.generateKeil4C51XmlContext();
  var filePath = await joint.join(path, "lib.uvproj");
  await joint.writeFileSync(filePath, data);
  startupData = await xmlUtils.generateKeil4C51StartupContext();
  var startupPath = await joint.join(path, "STARTUP.A51");
  await joint.writeFileSync(startupPath, startupData);

  console.log("keil4 c51 keilPath", filePath);

  return filePath;
};

const generateKeilProject = async (path) => {
  if (fontLibInfo.compilerVersion === "Keil5" && fontLibInfo.mcuArch == "ARM") {
    return await generateArmKeil5Project(path);
  } else if (fontLibInfo.compilerVersion === "Keil5" && fontLibInfo.mcuArch == "51") {
    return await generateC51Keil5Project(path);
  } else if (fontLibInfo.compilerVersion === "Keil4" && fontLibInfo.mcuArch == "ARM") {
    return await generateArmKeil4Project(path);
  } else if (fontLibInfo.compilerVersion === "Keil4" && fontLibInfo.mcuArch == "51") {
    return await generateC51Keil4Project(path);
  }
};

const decryptAllFile = async (rootPath) => {
  const filePath = [
    await joint.join(rootPath, `${fontLibInfo.font}.c`),
    // await joint.join(rootPath, `${fontLibInfo.font}.h`),
  ];
  for (var i = 0; i < filePath.length; i++) {
    var deData = await encrypt.deFileUtf8(filePath[i]);
    await joint.writeFileSync(filePath[i], deData);
  }
};

/**
 * 添加字库文件.c到keil工程里
 * @param rootPath 编译工程的根目录
 * @param keilPath keil工程路径
 */
const addFileToKeilProject = async (rootPath, keilPath,outputBaseName) => {
  var obj = await xmlUtils.getObjFromXML(keilPath);
  await xmlUtils.addFileToXML(obj, rootPath, `${outputBaseName}.c`);
  //在生成C51工程以及加入，这里不需要加
  // if (fontLibInfo.mcuArch == '51'){
  //   await xmlUtils.addFileToXML(obj, rootPath, "STARTUP.A51");
  // }
  await xmlUtils.setLibOutputName(obj, outputBaseName);
  await xmlUtils.writeXML(keilPath, obj);
  console.log(`[SUCCESS]---------->把${outputBaseName}.c文件加到工程`);
};

/**
 * not used
 */
const renameLib = async (rootPath, outPath) => {
  var oldLibPath = await joint.join(outPath, ".lib");
  var newLibPath = await joint.join(outPath, `${fontLibInfo.font}.lib`);
  var libPath = await joint.join(rootPath, `${fontLibInfo.font}.lib`);

  await joint.renameSync(oldLibPath, newLibPath);
  console.log(`[SUCCESS]---------->.lib重命名为${fontLibInfo.font}.lib`);

  await joint.copyFileSync(newLibPath, libPath);
  console.log(`[SUCCESS]---------->${newLibPath}复制到${libPath}`);
};

/**
 * not used
 */
const deleteArmAllFiles = async (rootPath, outPath, keilPath) => {
  const deleteFolderPath = [outPath, await joint.join(rootPath, "Listings")];
  const deleteFilePath = [
    joint.join(rootPath, `${fontLibInfo.font}.c`),
    keilPath,
  ];
  for (var i = 0; i < deleteFilePath.length; i++) {
    await joint.unlinkFileSync(deleteFilePath[i]);
  }
  for (var i = 0; i < deleteFolderPath.length; i++) {
    await joint.rmdirSync(deleteFolderPath[i]);
  }
};

/**
 * not used
 */
const deleteC51AllFiles = async (rootPath, outPath, keilPath) => {
  const deleteFolderPath = [outPath, await joint.join(rootPath, "Listings")];
  const deleteFilePath = [
    await joint.join(rootPath, `${fontLibInfo.font}.c`),
    keilPath,
    await joint.join(rootPath, "STARTUP.A51"),
  ];
  for (var i = 0; i < deleteFilePath.length; i++) {
    await joint.unlinkFileSync(deleteFilePath[i]);
  }
  for (var i = 0; i < deleteFolderPath.length; i++) {
    await joint.rmdirSync(deleteFolderPath[i]);
  }
};

/**
 * not used
 */
const deleteAllFiles = async (rootPath, outPath, keilPath) => {
  if (fontLibInfo.mcuArch == "ARM") {
    await deleteArmAllFiles(rootPath, outPath, keilPath);
  } else {
    await deleteC51AllFiles(rootPath, outPath, keilPath);
  }

  console.log(`[SUCCESS]---------->删除c文件与工程,只剩.lib,.h,说明文件.h`);
};

const copyFileToSavedPath = async (rootPath, libOutPath, savedPath,outputBaseName,) => {
  var libPath = await joint.join(savedPath, "04_字库API使用");
  var dataSheet = await joint.join(savedPath, "02_硬件资料");
  const libName= `${outputBaseName}.lib`
  const aName =  `${outputBaseName}.a` 
  const hName = `${outputBaseName}.h`
  const readmeName = `${outputBaseName}_readme.txt`
  const ruleBookName = `${outputBaseName}_规格书.pdf`
  const srcPath = [
    await joint.join(rootPath, hName),
    await joint.join(rootPath,readmeName),
    await joint.join(rootPath, ruleBookName),
  ];
  const destPath = [
    await joint.join(libPath, hName),
    await joint.join(libPath, readmeName),
    await joint.join(dataSheet, ruleBookName),
  ];
  if(fontLibInfo.compilerVersion === 'GCC' || fontLibInfo.compilerVersion === 'IAR'){
    srcPath.push(await joint.join(libOutPath,aName))
    destPath.push(await joint.join(libPath,aName))
  }else{
    srcPath.push(await joint.join(libOutPath,libName))
    destPath.push(await joint.join(libPath,libName))
  }
  for (var i = 0; i < srcPath.length; i++) {
    await joint.copyFileSync(srcPath[i], destPath[i])
      .catch(async (error) => {
        console.error('copy过程出错了', error);
        // throw error;
        await joint.generateDataSheetDesc(dataSheet);
      });
    console.log(`[SUCCESS]---------->成功copy到${destPath[i]}`);
  }
};

/**
 * 定时30秒查询.c文件，并删除
 */
const timedQuerySourceFile = async (rootPath,outputBaseName) => {
  clearInterval(intervalId); // 清除定时器
  // 设置定时器，每30秒检查一次文件
  intervalId = setInterval(async () => {
    const filePath = await joint.join(rootPath, `${outputBaseName}.c`);
    if (await joint.existsSync(filePath)) {
      try {
        await joint.unlinkFileSync(filePath);
        clearInterval(intervalId); // 清除定时器
        console.log(`[DELETE]---------->编译超过30秒,已删除文件: ${filePath}`);
        spannedFileLoading.value = false;
      } catch (error) {
        console.error(`[ERROR]---------->删除文件失败: ${error}`);
      }
    }

    await joint.deleteTempPath();

  }, 30 * 1000); // 30秒
};

let intervalLib = null
const inquireLibNum = ref(0);
const inquireLib = async (cFilePath) => {
  return new Promise(async (resolve, reject) => {
    const res = await joint.existsSync(cFilePath)
    if(!res) {
      clearTimeout(intervalLib)
      intervalLib = setTimeout(async() => {
        inquireLibNum.value ++
        if(inquireLibNum.value > 20) {
          clearTimeout(intervalLib)
          resolve(false)
        } else {
          await inquireLib(cFilePath)
        }
      }, 1000);
    } else {
      clearTimeout(intervalLib)
      resolve(true)
    }
  })
}
const keilBuildLib = async (keilPath, rootPath, savedPath,outputBaseName) => {
  await timedQuerySourceFile(rootPath,outputBaseName);
  try {
    const result = await window.electronAPI.execKeilCmd(fontLibInfo.compilerPath, keilPath, rootPath);
    if(result.status === 1){
      console.error(`${result.msg}`);
      ElMessage.error(`字库lib文件, 编译出现错误`);
      throw new Error(result.msg);
    }
    const cFilePath = await joint.join(result.outPath, `${outputBaseName}.lib`);
    //TODO: keil4-->arm-->编译成功和失败,result.status都是返回0,无法区别编译成功还是失败，所以加了判断.lib是否存在
    inquireLibNum.value = 0
    const lib_is_finish = await inquireLib(cFilePath)
    console.log(`---------->>>>${lib_is_finish}`);
    if (lib_is_finish) {
      await generateFontDirStructure(fontLibInfo.libPath, savedPath);
      console.log(`[SUCCESS]---------->${result.msg}`);
      if (!(await joint.existsSync(savedPath))) {
        await joint.mkdirSync(savedPath);
      }
      await copyFileToSavedPath(rootPath, result.outPath, savedPath,outputBaseName);
      console.log("[END]---------->生成库文件结束");
      ElMessage.success(`${outputBaseName}.lib 已生成`);
      clickRecode('success',`${outputBaseName}.lib 已生成`)
    }else{
      const errorMsg = `字库lib文件编译完成，但未找到输出文件: ${outputBaseName}.lib`;
      console.error(errorMsg);
      ElMessage.error(errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error("编译过程出错了", error);
    ElMessage.warning("请检查编译器路径，处理器参数等是否设置正确");
    // //编译出错就删除.c文件
    // const filePath = await joint.join(rootPath, `${fontLibInfo.font}.c`);
    // if (await joint.existsSync(filePath)) {
    //     await joint.unlinkFileSync(filePath);
    //     console.log(`[DELETE]---------->已删除文件: ${filePath}`);
    // }

    await joint.deleteTempPath();
    clickRecode('error',error.message)
    throw error;
  } finally {
    clearInterval(intervalId); // 清除定时器
  }
};
/**
 * gcc编译字库lib
 */
const gccBuildLib = async (rootPath, savedPath, outputBaseName) => {
  await timedQuerySourceFile(rootPath,outputBaseName);
  const arch =gccInfo.arch&&gccInfo.arch!=='-'?'-mcpu='+gccInfo.arch:''
  const std = gccInfo.arch&&gccInfo.std!=='-'?'-std='+gccInfo.std:''
  const floatType = gccInfo.arch&&gccInfo.std!=='-'?'-mfloat-abi='+gccInfo.floatType:''
  const optimization = gccInfo.arch&&gccInfo.optimization!=='-'?gccInfo.optimization:''
  const customTemp= `${gccInfo.compileText ? gccInfo.compileText : ""} ${gccInfo.isMthumb ? "-mthumb" : ""} ${gccInfo.isWpointerArith ? "-Wpointer-arith" : ""} ${gccInfo.isMlongcalls ? "-mlongcalls" : ""}`
  const makeCmd = `"${gccInfo.gccName}" -c ${arch} ${std} ${floatType} ${optimization}  ${customTemp} ${outputBaseName}.c && "${gccInfo.arName}"  -rc ${outputBaseName}.a ${outputBaseName}.o`
  let result = await window.electronAPI.execGccCmd(makeCmd, rootPath)
  if (result.status === 0) {
    // gcc生成的是a文件
    const libSrcPath = await joint.join(rootPath, `${outputBaseName}.a`)
    const libExists = await joint.existsSync(libSrcPath)
    if (!libExists) {
      const msg = 'gcc编译出现错误，未找到输出文件'
      ElMessage.error(msg)
      clickRecode('error', msg)
      throw new Error(msg)
    }
    await generateFontDirStructure(fontLibInfo.libPath, savedPath)
    if (!(await joint.existsSync(savedPath))) {
        await joint.mkdirSync(savedPath);
    }
    await copyFileToSavedPath(rootPath, rootPath, savedPath,outputBaseName);
    ElMessage.success(`${outputBaseName}.a 已生成`)
    clickRecode('success', `${outputBaseName}.a 已生成`)
  } else {
    ElMessage.error(result.msg)
    clickRecode('error', result.msg)
    throw new Error(result.msg)
  }
}

/**
 * 编译字库lib
 */
 const iarBuildLib = async (ewpPath, rootPath, savedPath, outputBaseName,configName) => {
  await timedQuerySourceFile(rootPath,outputBaseName);
  let result = await window.electronAPI.execIARCmd(fontLibInfo.compilerPath, ewpPath, configName, rootPath)
  if (result.status === 0) {
    // gcc生成的是a文件
    const outPath= await joint.join(rootPath, 'out')
    const libSrcPath = await joint.join(outPath, `${outputBaseName}.a`)
    const libExists = await joint.existsSync(libSrcPath)
    if (!libExists) {
      const msg = 'iar编译出现错误，未找到输出文件'
      ElMessage.error(msg)
      clickRecode('error', msg)
      throw new Error(msg)
    }
    await generateFontDirStructure(fontLibInfo.libPath, savedPath)
    if (!(await joint.existsSync(savedPath))) {
        await joint.mkdirSync(savedPath);
    }
    await copyFileToSavedPath(rootPath, outPath, savedPath,outputBaseName);
    ElMessage.success(`${outputBaseName}.a 已生成`)
    clickRecode('success', `${outputBaseName}.a 已生成`)
  } else {
    ElMessage.error(result.msg)
    clickRecode('error', result.msg)
    throw new Error(result.msg)
  }
}


/**
 * 生成对应字库文件目录结构
 * @param libPath 库文件生成路径根目录(用户自己定义)
 * @param savedPath libPath根目录下的对应字库路径
 */
const generateFontDirStructure = async (libPath, savedPath) => {

  if (await joint.existsSync(savedPath)) {
    await joint.rmdirSync(savedPath);
    console.log(`[SUCCESS]---------->删除原有的字库文件目录`);
  }

  //软件目录下/Database/高通字库芯片开发资料.zip
  var curPath = await joint.join(await joint.getRelativePath(".", "Database"), "高通字库芯片开发资料.zip");

  //savedPath/高通字库芯片开发资料.zip
  var fontZip = await joint.join(libPath, "高通字库芯片开发资料.zip");

  if (! await joint.existsSync(fontZip)) {
    await joint.copyFileSync(curPath, fontZip);
  }

  //解压
  await uncompressFile(curPath, libPath);

  //删除压缩包
  await joint.unlinkFileSync(fontZip);

  var fontOldName = await joint.join(libPath, "高通字库芯片开发资料");

  await joint.renameSync(fontOldName, savedPath);
  console.log(`[SUCCESS]---------->${fontOldName}重命名为${savedPath}`);
};

const checkSettingsValidated = () => {
  if (!fontLibInfo.font) {
    ElMessage.warning("请选择字库型号");
    return false;
  }
  if (!fontLibInfo.libPath) {
    ElMessage.warning("请选择库文件生成路径");
    return false;
  }
  if (fontLibInfo.compilerVersion === 'GCC') {
    if (!gccInfo.gccName || !gccInfo.arName) {
      ElMessage.warning("请完善gcc/ar执行文件路径");
      return false;
    }
    return true;
  }
  if (!fontLibInfo.compilerPath) {
    ElMessage.warning("请选择本地编译器路径");
    return false;
  }
  if (!fontLibInfo.compilerPath.toString().endsWith("exe")) {
    ElMessage.warning("请检查本地编译器是否设置正确");
    console.error(
      "[ERROR]---------->[Keil5 Lib Config] custom path file must be an exe file."
    );
    return false;
  }
  if(isKeil.value){
    if (fontLibInfo.mcuArch == "ARM") {
      if (!armInfo.mcuType || !armInfo.optimizationLevel) {
        ElMessage.warning("请完善ARM处理器参数");
        return false;
      }
    } else {
      if (
        !c51Info.mcuType ||
        !c51Info.memoryModel ||
        !c51Info.codeRomSize ||
        !c51Info.operatingSystem
      ) {
        ElMessage.warning("请完善51处理器参数");
        return false;
      }
    }
  }
  if(fontLibInfo.compilerVersion === 'IAR'){
    if(!fontLibInfo.projectPath){
        ElMessage.warning("请完善IAR工程文件路径");
        return false
      }
    if(!fontLibInfo.projectPath.toString().endsWith("ewp")){
      ElMessage.warning("请检查本地编译器是否设置正确");
      return false
    }
    if(!fontLibInfo.iarConfiguration){
      ElMessage.warning("请选择IAR编译配置");
      return false
    }
  }
  return true;
};

const generateLib = async () => {
  if (!checkSettingsValidated()) {
    return;
  }

  //保存生成字库lib相关信息
  approvalFormStore.setFontlibraryList({ ...fontLibInfo, gccName: gccInfo.gccName, arName: gccInfo.arName });

  try {
    //临时文件夹路径(C:/Users/UserName/AppData/Local/Temp/xxx)
    const tempPath = await joint.getTempPath();
    const bitName = fontLibInfo.mcuArch==='ARM'?'32bit':'8bit';
    //下载服务器字库源文件压缩包路径
    const zipPath = await joint.join(tempPath, `${fontLibInfo.mcuArch}_${fontLibInfo.font}.zip`);
    //字库编译时的根目录路径
    const rootPath = await joint.join(tempPath, `${fontLibInfo.mcuArch}_${fontLibInfo.font}`);
    //对应字库生成路径
    const savedPath = await joint.join(fontLibInfo.libPath, `${bitName}_${fontLibInfo.compilerVersion}_${fontLibInfo.font}`);
    saveFilePath.value = savedPath; //保存路径

    spannedFileLoading.value = true; //打开Loading

    const hasManualDriver =activate.value &&  !!(fontLibInfo.driverCPath && fontLibInfo.driverHPath);
    const useLocalDriver = hasManualDriver;
    const cFileName = hasManualDriver ? getFileNameFromPath(fontLibInfo.driverCPath) : `${fontLibInfo.font}.c`;
    const hFileName = hasManualDriver ? getFileNameFromPath(fontLibInfo.driverHPath) : `${fontLibInfo.font}.h`;
    const outputBaseName = hasManualDriver ? (getFileBaseName(cFileName) || fontLibInfo.font) : fontLibInfo.font;
    //step1:下载字库源文件压缩包
    await downloadFontFile(fontLibInfo.mcuArch, fontLibInfo.font, zipPath);
    //step2:解压字库源文件
    await uncompressFile(zipPath, tempPath);
    //删除字库源文件压缩包
    await joint.unlinkFileSync(zipPath);
    //手动传入 c/h 时：保留原始文件名，不改名
    if (useLocalDriver) {
      const destCPath = await joint.join(rootPath, cFileName);
      const destHPath = await joint.join(rootPath, hFileName);
      await joint.copyFileSync(fontLibInfo.driverCPath, destCPath);
      await joint.copyFileSync(fontLibInfo.driverHPath, destHPath);
    }
      //  step3:解密.c文件
    if (!useLocalDriver) {
        await decryptAllFile(rootPath);
      }
    if (fontLibInfo.compilerVersion === 'Keil4'|| fontLibInfo.compilerVersion === 'Keil5') {
        //step4:生成keil工程文件
        var keilPath = await generateKeilProject(rootPath);

        //step5:把参数更新到工程里
        await setProjectInfo(keilPath);

        //step6:把.c文件加到keil工程里
        await addFileToKeilProject(rootPath, keilPath,outputBaseName);
        //step7:编译
        await keilBuildLib(keilPath, rootPath, savedPath,outputBaseName);
    } else if(fontLibInfo.compilerVersion === 'GCC')  {
        //  gcc编译
        //step4:gcc编译
        await gccBuildLib(rootPath, savedPath, outputBaseName);
    } else if(fontLibInfo.compilerVersion === 'IAR') {
      // step4:清理工程文件的其他c文件
      const  projectPath =   fontLibInfo.projectPath
      const isEwpFile = fontLibInfo.projectPath.endsWith('.ewp');
      if(!isEwpFile){
        ElMessage.error('工程文件格式不正确');
        throw new Error()
      }
      const fileName = projectPath.split('\\').pop().split('/').pop(); // 获取文件名
      const ewpPath = await joint.join(rootPath, fileName); // 在 rootPath 下创建目标路径
       // step5：复制工程文件到目标路径
      await joint.copyFileSync(projectPath, ewpPath);
      // step6: 处理工程文件
      var obj = await xmlUtils.getObjFromXML(ewpPath);
      const configName = fontLibInfo.iarConfiguration;
      await xmlUtils.setGOutputBinary(obj, configName, '1')
      // 设置输出路径
      await xmlUtils.setExePath(obj, configName, 'out')
      const libPath = await joint.join(rootPath,`out\\${outputBaseName}.a`)
      await xmlUtils.setoutPath(obj, configName, libPath)
      await xmlUtils.setIarchiveOverride(obj, configName, '1')
      // 删除现有的文件并添加新的 C 文件
      await xmlUtils.updateIarProjectFiles(obj, `${outputBaseName}.c`);
      await xmlUtils.writeXML(ewpPath, obj);
      // step7: 编译
      await iarBuildLib(ewpPath, rootPath, savedPath, outputBaseName, configName)
    }
    //删除临时文件夹
    await joint.deleteTempPath();
    spannedFileLoading.value = false; //关闭Loading
    centerDialogVisible.value = true; //打开成功提示弹窗
  } catch (error) {
    await joint.deleteTempPath();
    spannedFileLoading.value = false; //关闭Loading
    console.log(error);
  }
};



const getFileNameFromPath = (filePath) => {
  if (!filePath) return '';
  return filePath.split('\\').pop().split('/').pop();
};
const getFileBaseName = (fileName) => {
  if (!fileName) return '';
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
};


// 弹窗打开生成文件
const openFile = async () => {
  // const filePath = inputFiles.value;
  const filePath = saveFilePath.value;
  window.electronAPI.openFolder(filePath);
};

const clickRecode = (type,message)=>{
  // 记录操作次数和成功或失败信息
  const data = {
    call_category:'自动库助手',
    call_sub_category:`${fontLibInfo.mcuArch}-${fontLibInfo.font}`,
    call_structure:JSON.stringify({
      result:type,
      version:fontLibInfo.compilerVersion,
      mcuArch:fontLibInfo.mcuArch,
      font:fontLibInfo.font,
      message:message
    }),
  }
  if(type=='error'){
    data['call_err'] = message
  }
  callRecord(data)
}
/* 字库选择*********************************************************************************************** */
const optionsChmDecomposer = [
  { value: "ARM", label: "32位" },
  { value: "51", label: "8位" },
];


const optionCompilerVersion = computed(() => {
  if (fontLibInfo.mcuArch === '51') {
    return [
      { value: "Keil4", label: "Keil4" },
      { value: "Keil5", label: "Keil5" },
      { value: "GCC", label: "GCC" },
    ]
  } else {
    return [
      { value: "Keil4", label: "Keil4" },
      { value: "Keil5", label: "Keil5" },
      { value: "GCC", label: "GCC" },
      { value: "IAR", label: "IAR" },
    ]
  }
})

/* ARM处理器参数*********************************************************************************** */

//Keil5 ARM处理器
const optionsARM = [
  {
    value: "Cortex-M0",
    label: "Cortex-M0",
  },
  {
    value: "Cortex-M0+",
    label: "Cortex-M0+",
  },
  {
    value: "Cortex-M3",
    label: "Cortex-M3",
  },
  {
    value: "Cortex-M33",
    label: "Cortex-M33",
  },
  {
    value: "Cortex-M4",
    label: "Cortex-M4",
  },
  {
    value: "Cortex-M7",
    label: "Cortex-M7",
  },
];
//Keil4 ARM处理器
const optionsKeil4ARM = [
  {
    value: "Cortex-M0",
    label: "Cortex-M0",
  },
  {
    value: "Cortex-M0+",
    label: "Cortex-M0+",
  },
  {
    value: "Cortex-M1",
    label: "Cortex-M1",
  },
  {
    value: "Cortex-M3",
    label: "Cortex-M3",
  },
  {
    value: "Cortex-M4",
    label: "Cortex-M4",
  },
];
// 编译器内核版本
const optionsCompiler = [
  {
    value: "0",
    label: "AC5",
  },
  {
    value: "1",
    label: "AC6",
  },
  // {
  //   value: "V6.15",
  //   label: "V6.15",
  // },
  // {
  //   value: "V5.04 update (build 49)",
  //   label: "V5.04 update (build 49)",
  // },
];
// 优先等级
const optimizationAC5 = [
  {
    value: "0",
    label: "default",
  },
  {
    value: "1",
    label: "Level 0(-O0)",
  },
  {
    value: "2",
    label: "Level 1(-O1)",
  },
  {
    value: "3",
    label: "Level 2(-O2)",
  },
  {
    value: "4",
    label: "Level 3(-O3)",
  },
];
// 优先等级
const optimizationAC6 = [
  {
    value: "0",
    label: "default",
  },
  {
    value: "1",
    label: "Level 0(-O0)",
  },
  {
    value: "2",
    label: "Level 1(-O1)",
  },
  {
    value: "3",
    label: "Level 2(-O2)",
  },
  {
    value: "4",
    label: "Level 3(-O3)",
  },
  {
    value: "5",
    label: "Ofast",
  },
  {
    value: "6",
    label: "Os balanced",
  },
  {
    value: "7",
    label: "Oz image Size",
  },
];
// compiler mode
const compilerMode = [
  {
    value: "0",
    label: "default -std=gun11",
  },
  {
    value: "1",
    label: "C90",
  },
  {
    value: "3",
    label: "C99",
  },
];

/*51处理器参数部分********************************************************************************** */

// MCU内核类型
const optionsMCU = [
  {
    value: "GX8S003",
    label: "GX8S003",
  },
  {
    value: "STC10F08XE",
    label: "STC10F08XE",
  },
  {
    value: "STC11F02E",
    label: "STC11F02E",
  },
  {
    value: "STC11F60XE",
    label: "STC11F60XE",
  },
  {
    value: "STC12C2052AD",
    label: "STC12C2052AD",
  },
  {
    value: "STC12C5202AD",
    label: "STC12C5202AD",
  },
  {
    value: "STC12C5410AD",
    label: "STC12C5410AD",
  },
  {
    value: "STC12C5616AD",
    label: "STC12C5616AD",
  },
  {
    value: "STC12C5A60S2",
    label: "STC12C5A60S2",
  },
  // {
  //   value: "STC12H1K08",
  //   label: "STC12H1K08",
  // },
  {
    value: "STC15F104E",
    label: "STC15F104E",
  },
  {
    value: "STC15F104W",
    label: "STC15F104W",
  },
  {
    value: "STC15F204EA",
    label: "STC15F204EA",
  },
  {
    value: "STC15F2K60S2",
    label: "STC15F2K60S2",
  },
  {
    value: "STC15F408AD",
    label: "STC15F408AD",
  },
  {
    value: "STC15W104",
    label: "STC15W104",
  },
  {
    value: "STC15W1K16S",
    label: "STC15W1K16S",
  },
  {
    value: "STC15W204S",
    label: "STC15W204S",
  },
  {
    value: "STC15W408AS",
    label: "STC15W408AS",
  },
  {
    value: "STC15W408S",
    label: "STC15W408S",
  },
  {
    value: "STC15W4K32S4",
    label: "STC15W4K32S4",
  },
  {
    value: "STC89C52RC",
    label: "STC89C52RC",
  },
  {
    value: "STC89C58RD+",
    label: "STC89C58RD+",
  },
  // {
  //   value: "STC8A8K64D4",
  //   label: "STC8A8K64D4",
  // },
  {
    value: "STC8A8K64S4A12",
    label: "STC8A8K64S4A12",
  },
  {
    value: "STC8C1K08",
    label: "STC8C1K08",
  },
  // {
  //   value: "STC8C2K64S4",
  //   label: "STC8C2K64S4",
  // },
  {
    value: "STC8F1K08S2",
    label: "STC8F1K08S2",
  },
  {
    value: "STC8F2K64S4",
    label: "STC8F2K64S4",
  },
  {
    value: "STC8G1K08",
    label: "STC8G1K08",
  },
  // {
  //   value: "STC8G1K08T",
  //   label: "STC8G1K08T",
  // },
  {
    value: "STC8G2K64S4",
    label: "STC8G2K64S4",
  },
  // {
  //   value: "STC8G1K08T",
  //   label: "STC8G1K08T",
  // },
  // {
  //   value: "STC8G2K64S4",
  //   label: "STC8G2K64S4",
  // },
  {
    value: "STC8H1K08",
    label: "STC8H1K08",
  },
  {
    value: "STC8H1K16",
    label: "STC8H1K16",
  },
  // {
  //   value: "STC8H1K28",
  //   label: "STC8H1K28",
  // },
  // {
  //   value: "STC8H2K64T",
  //   label: "STC8H2K64T",
  // },
  // {
  //   value: "STC8H3K64S4",
  //   label: "STC8H3K64S4",
  // },
  // {
  //   value: "STC8H4K64TLR",
  //   label: "STC8H4K64TLR",
  // },
  // {
  //   value: "STC8H8K64U",
  //   label: "STC8H8K64U",
  // },
  {
    value: "STC90C52RC",
    label: "STC90C52RC",
  },
  {
    value: "STC90C58AD",
    label: "STC90C58AD",
  },
  {
    value: "STC90C58RD+",
    label: "STC90C58RD+",
  },
];
// Memory Model
const optionsMemoryModel = [
  {
    value: "0",
    label: "Small: varables in DATA",
  },
  {
    value: "1",
    label: "Compact: varables in PDATA(默认)",
  },
  {
    value: "2",
    label: "Large: variables in XDATA",
  },
];
// Code Rom Size
const optionsCodeRomSize = [
  {
    value: "0",
    label: "Large: 64K program(默认)",
  },
  {
    value: "1",
    label: "Small: program 2K or less",
  },
  {
    value: "2",
    label: "Compact: 2Kfunctions, 64K program",
  },
];
// OPerating system
const optionsOperatingSystem = [
  {
    value: "0",
    label: "RTX-51 Tiny",
  },
  {
    value: "1",
    label: "RTX-51 Full",
  },
  {
    value: "2",
    label: "one(默认)",
  },
];
</script>

<style scoped>
body,
html {
  margin: 0;
  padding: 0;
}

.App-Header {
  /* border: 1px solid #d0cccc; */
  /* height: 60vh; */
  /* height: calc(94vh - 50px); */
  /* background-color: red; */
  height: 88vh;
  overflow-y: auto;
  /* scrollbar-width: 50px;  */
  /* padding: 10px 10px; */
}

.Card-Header {
  display: flex;
  justify-content: space-around;
}

.button-submit {
  display: flex;
  justify-content: space-around;
  margin-top: 22px;
  /* width: 200px; */
}

.App-title {
  /* background: #6699ff;
  border-radius: 50% 50%;
  width: 200px;
  text-align: center; */
  border-radius: 16px;
  border: 1px solid #e8e9fb;
  box-shadow: 0 0 10px #e8e9fb;
  text-align: center;
  width: 160px;
  color: #409eff;
}

/* Webkit 浏览器（Chrome、Safari）的滚动条样式 */
/* .App-Header::-webkit-scrollbar {
  width: 6px;
}

.App-Header::-webkit-scrollbar-thumb {
  background-color: #DDDEE0;
  border-radius: 10px;
}

.App-Header::-webkit-scrollbar-track {
  background-color: #ffffff;
} */
.gcc_compile_version_hint{
  height: 350px;
  background-image: url("@/assets/gcc_compile_version_hint.png");
  background-size: 100% 100%;
}
.local-compiler-guide-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.local-compiler-guide-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.local-compiler-guide-table th,
.local-compiler-guide-table td {
  border: 1px solid #ebeef5;
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.local-compiler-guide-table th {
  background: #f5f7fa;
}
.local-compiler-guide-note {
  margin-top: 8px;
  color: #606266;
  font-size: 12px;
}
.gcc-guide-content {
  color: #303133;
  font-size: 14px;
  line-height: 1.7;
}
.gcc-guide-content h4 {
  margin: 10px 0 8px;
  font-size: 15px;
}
.gcc-guide-table {
  width: 100%;
  border-collapse: collapse;
  margin: 6px 0 10px;
}
.gcc-guide-table th,
.gcc-guide-table td {
  border: 1px solid #ebeef5;
  padding: 6px 10px;
  text-align: left;
}
.gcc-guide-table th {
  background: #f5f7fa;
}
.gcc-guide-steps {
  margin: 0 0 8px 18px;
}
.gcc-guide-steps li {
  margin-bottom: 6px;
}
.gcc-guide-step-block {
  margin-bottom: 12px;
}
.gcc-guide-step-text {
  margin-bottom: 8px;
}
.gcc-guide-images {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gcc-guide-image-item {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
}
.gcc-guide-image-title {
  margin-bottom: 8px;
  font-size: 13px;
  color: #606266;
}
.gcc-guide-image {
  width: 100%;
  max-height: 300px;
}
.gcc-guide-image-error {
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  color: #909399;
}
.popover-Img {
  height: 500px;
  background-image: url("@/assets/Lib-helper-hint-diagram.png");
  background-size: 100% 100%;
}
.popover-img_iar {
  height: 500px;
  background-image: url("@/assets/ewp-help-hint-diagram.png");
  background-size: 100% 100%;
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
.fontSize_All{
  font-size: 14px;
}
.compile_img{
  background-image: url(../../../assets/compile_img.png);
  background-size: 100% 100%;
  width: 550px;
  height: 550px;
  margin: 10px 0px;
}
.compile_img_iar{
  background-image: url(../../../assets/compile_img_iar.png);
  background-size: 100% 100%;
  width: 780px;
  height: 700px;
  margin: 10px 0px;
}

</style>
