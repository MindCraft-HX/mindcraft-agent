<template>
  <div class="chat-layout">
    <!-- 侧边栏 -->
    <Room ref="room" class="room" :messages="messages" @updateRecordRoomProperties="updateRecordRoomProperties"
      @getRoomAttributes="getRoomAttributes" @getChatHistory="getChatHistory" />
    <div class="chat-box" @dragover.prevent @drop="handleDrop">
      <!-- 上面的选项 -->
      <!-- :data="RoomAttributes" -->
      <StatusBar :data="RoomAttributes" :selectedRoomName="selectedRoomName" :activeRoom="activeRoom"
        @deleteChatHistory="deleteChatHistory" @openLibrary="openLibrary" @openPrompt="openPrompt"
        @offHandle="offHandle" @OffPrompt="OffPrompt" @off_FileSwitch="off_FileSwitch"
        v-model:libraryEchoId="libraryEchoId" :privilege="privilege" />

      <div ref="chatContentRef" class="message-list">
        <!-- user_id -->
        <div v-for="message in messages" :key="message.id" class="message" :id="`test${message.id}`"
          :class="message.sender === username ? 'my-message' : 'other-message'">
          <!-- GPT回复的消息 -->
          <div class="message-content" v-if="message.send_type === 'message'">
            <div class="message-username" v-if="message.sender !== username">
              {{ message.sender }}
            </div>

            <div class="message-value" v-if="editingMessageId !== message.id">
              <div style="overflow: auto;">
                <!-- <div v-html="renderHtml(message.content)" :class="{ 'error-text': message.error }" /> -->
                <!-- <div v-if="message.sender == username" v-text="message.content"
                  :class="{ 'error-text': message.error }" /> -->
                <template v-if="message?.search_list?.length">
                  <el-button @click="openSearchDialog(message)" type="primary" class="open-think" link icon="search">已搜索到{{ message?.search_list?.length || 0 }}个网页 <div style="margin-left: 6px;" class="open-think-icon"></div></el-button>
                </template>
                  <!-- todo 后面优化下 -->
                <template v-if="message.think">
                  <div @click="chooseThinkId(message.id)" class="open-think"><div class="open-think-icon"></div>思考过程（点击展开）</div>
                  <template v-if="thinkId == message.id">
                    <div class="think-value" v-if="mdRenderType" v-katex="optionsKatex" v-html="renderHtml(getPlainContent(message.think))"
                    :class="{ 'error-text': message.error }" />
                    <div class="think-value" v-else v-html="renderHtml(getPlainContent(message.think))"
                    :class="{ 'error-text': message.error }" />
                  </template>
                  <div v-if="mdRenderType" v-katex="optionsKatex" v-html="renderHtml(getPlainContent(message.displayContent))"
                  :class="{ 'error-text': message.error }" />
                  <div v-else v-html="renderHtml(getPlainContent(message.displayContent))"
                  :class="{ 'error-text': message.error }" />
                </template>
                <template v-else>
                  <!-- 用户自己的消息不走 Markdown 渲染，避免 \\ 被转义 -->
                  <div v-if="message.sender === username" style="white-space: pre-wrap;" v-text="message.content"
                  :class="{ 'error-text': message.error }" />
                  <template v-else>
                    <div v-if="mdRenderType" v-katex="optionsKatex" v-html="renderHtml(getPlainContent(message.content))"
                    :class="{ 'error-text': message.error }" />
                    <div v-else v-html="renderHtml(getPlainContent(message.content))"
                    :class="{ 'error-text': message.error }" />
                  </template>
                </template>



                <el-collapse v-if="shouldShowCollapse(message)" v-model="message.activeName"
                  @change="val => changeCollapse(val, message)">
                  <!-- v-if="shouldRenderECharts" -->
                  <el-collapse-item name="1" v-if="message.is_collapse">
                    <template #title>
                      <!-- 正在分析处理中... -->
                      <div class="dispose" v-if="message.message_structure?.agent_process_data
      ?.status_category == '1'
      ">
                      </div>
                      <!--  正在搜索内容...  -->
                      <div class="search" v-if="message.message_structure?.agent_process_data
      ?.status_category == '2'
      ">
                      </div>
                      <div style="color: #000000;font-weight: 600;" v-if="message.message_structure?.agent_process_data
      ?.status_category == '3'
      ">
                        搜索完毕
                      </div>
                      <div v-if="message.message_structure?.agent_process_data
      ?.status_category == '4'
      " style="display: flex; align-items: center;color: #000000;font-weight: 600;">
                        处理完毕
                        <SuccessFilled style="
                            color: #04c909;
                            width: 30px;
                            height: 18px;
                            margin-bottom: 2px;
                          " />
                      </div>
                      <!-- 正在生成图片中...  -->
                      <div class="Generate_picture" v-if="message.message_structure?.agent_process_data
      ?.status_category == '5'
      ">
                      </div>
                      <!-- 正在识别图片中... -->
                      <div class="Identify_picture" v-if="message.message_structure?.agent_process_data
      ?.status_category == '6'
      ">
                      </div>
                    </template>
                    <div v-html="renderHtml(getStraightAnswerContent(message.content))"
                      :class="{ 'error-text': message.error }" />
                  </el-collapse-item>
                  <!-- 渲染图表的折叠 -->
                  <el-collapse-item
                    v-if="(message.sender !== username && message.chart_code?.length > 0) || message.message_structure?.agent_process_data?.status_category == '3'"
                    name="2" style="margin-top: 5px;">
                    <template #title>
                      <!-- 正在生成图表内容...-->
                      <div style="display: flex;align-items: center;justify-content: space-between;width: 96%;">
                        <div>
                          <div class="Generate_chart"
                            v-if="message.message_structure?.agent_process_data?.status_category == '3'">
                          </div>
                          <div v-if="message.message_structure?.agent_process_data?.status_category == '4'"
                            style="display: flex; align-items: center;color: #000000;font-weight: 600;">
                            图表处理完毕
                            <SuccessFilled style="color: #04c909;width: 30px;height: 18px;margin-bottom: 2px;" />
                          </div>
                        </div>
                        <div>点击展开</div>
                      </div>
                    </template>

                    <!-- 图表 -->
                    <div v-for="chart in message.chart_code" :key="chart.chart_code">
                      <Agent_ECharts v-if="chart.chart_type === 'ECharts'" :messages_ECharts="chart" @click.stop />
                      <Agent_Mermaid v-if="chart.chart_type === 'Mermaidjs'" :messages_Mermaid="chart" @click.stop />
                      <Agent_MakmapLib v-if="chart.chart_type === 'MarkmapLib'" :messages_MarkmapLib="chart"
                        @click.stop />
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </div>

              <div v-if="Array.isArray(message.files) && message.files.length > 0">
                <div v-for="(file, index) in message.files" :key="index">
                  <!-- file.file_type === 'PNG' || file.file_type === 'JPEG'" -->
                  <el-image v-if="file.image_width" :src="file.file_url" alt="Image"
                    style="max-width: 500px; max-height: 500px" fit="cover" lazy
                    :preview-src-list="message.files.filter(f => f.image_width).map((img) => img.file_url)"
                    :initial-index="index" />
                  <video v-else-if="file.file_type === 'video/mp4'" preload="meta" style="width: 500px; height: 370px;" controls
                    :src="file.file_url"></video>
                </div>
              </div>

            </div>

            <div v-else>
              <el-input v-model="message.content" type="textarea" autosize
                @keyup.enter.exact="editMessage(message.id, message.content)" @keydown.shift="changeLine"
                @keyup.esc="endEditing" style="margin-bottom: 5px" />
              <el-button @click="editMessage(message.id, message.content)" icon="Check" type="primary" size="small" />
              <el-button @click="endEditing(message.id)" icon="Close" type="danger" size="small" />
            </div>
          </div>

          <!-- 这里是流程图 -->
          <div v-else-if="message.send_type === 'Mermaidjs'">
            <div class="Advanced_button" @click="openFlowDiagram(message.id)">
              <div>
                <svg class="icon" aria-hidden="true" style="font-size: 20px; margin-right: 5px">
                  <!-- #icon-xingzhuang -->
                  <use xlink:href="#icon-xingzhuang"></use>
                </svg>
                已生成{{ chartTypeForMessage(message.content) }}，点击查看
              </div>
            </div>
          </div>
          <!-- jsMind -->
          <!-- <div v-else-if="message.send_type === 'jsMind'">
            <el-button class="diagramButton" type="primary" @click="openJsMind(message.id)">
              <svg class="icon" aria-hidden="true" style="font-size: 20px; margin-bottom: 4px">
                <use xlink:href="#icon-luojituright"></use>
              </svg>

              <div style="font-size: 18px; margin-left: 6px">
                已生成思维导图，点击查看
              </div>
            </el-button>
          </div> -->
          <!-- ECharts -->
          <div v-else-if="message.send_type === 'ECharts'">
            <div class="Advanced_button" @click="openDThreeJs(message.id)">
              <div>
                <svg class="icon" aria-hidden="true" style="font-size: 20px; margin-right: 5px">
                  <use xlink:href="#icon-tubiao1"></use>
                </svg>
                已生成数据图表，点击查看
              </div>
            </div>
          </div>
          <!-- 表格Excel -->
          <div v-else-if="message.send_type === 'xlsx'">
            <div class="Advanced_button" @click="openExcel(message.id)">
              <div>
                <svg class="icon" aria-hidden="true" style="font-size: 20px; margin-right: 5px">
                  <use xlink:href="#icon-xls1"></use>
                </svg>
                已生成表格，点击查看
              </div>
            </div>
          </div>
          <!-- 文档DOCX -->
          <div v-else-if="message.send_type === 'docx'">
            <div class="Advanced_button" @click="openDOCX(message.id)">
              <div>
                <svg class="icon" aria-hidden="true" style="font-size: 20px; margin-right: 5px">
                  <use xlink:href="#icon-WORD"></use>
                </svg>
                已生成文档，点击查看
              </div>
            </div>
          </div>
          <!-- MarkmapLib思维导图 -->
          <div v-else-if="message.send_type === 'MarkmapLib'">
            <div class="Advanced_button" @click="openMarkmapLib(message.id)">
              <div>
                <svg class="icon" aria-hidden="true" style="font-size: 20px; margin-right: 5px">
                  <use xlink:href="#icon-luojituright"></use>
                </svg>
                已生成思维导图，点击查看
              </div>
            </div>
          </div>
          <div class="message-info">
            <div class="message-model" v-if="message.sender !== username && message.send_type === 'message' && !message.message_structure?.agent_process_data?.is_agent === true
      ">
              模型: {{ message.llm_model }}
            </div>
            <div class="message-token-usage" v-if="message.sender !== username &&
      message.send_type === 'message' &&
      message.usage !== null
      ">
              Token使用:
              <span v-for="(value, key) in message.usage" :key="key">
                {{ key }}: {{ value }},
              </span>
            </div>
            <div class="message-stop-reason" v-if="message.sender !== username &&
      message.send_type === 'message' &&
      message.usage !== null
      ">
              停止原因:
              {{ message.stop_reason === "stop" ? "回答完毕" : "字数上限" }}
            </div>
            <div class="message-actions" v-if="message.send_type === 'message'">
              <el-tooltip effect="light" content="重新发送" v-if="message.sender === username">
                <el-button icon="Refresh" @click="refreshMessage(message)" />
              </el-tooltip>
              <el-tooltip effect="light" content="编辑">
                <el-button icon="Edit" @click="startEditing(message.id)" />
              </el-tooltip>
              <el-tooltip effect="light" content="复制文本">
                <el-button icon="copyDocument" @click="copyMessage(message.content)" />
              </el-tooltip>
              <!-- <el-tooltip effect="light" content="复制文本和图表">
                <el-button icon="imageCopy" @click="copyTextAndChart(message.id)" />
              </el-tooltip> -->
              <el-tooltip effect="light" content="复制文本+格式">
                <el-button icon="documentCopy" @click="copyHtml(message.content)" />
              </el-tooltip>
              <el-tooltip effect="light" content="删除">
                <el-button icon="Delete" @click="deleteMessage(message.id)" />
              </el-tooltip>
              <el-tooltip effect="light" content="收藏">
                <el-button icon="Star" @click="collectContent(message.id)" />
              </el-tooltip>
              <el-tooltip effect="light" content="截屏" v-if="message.sender !== username">
                <el-button icon="CameraFilled" @click="screenCapture(message.id)" />
              </el-tooltip>
              <template v-if="message.showMore">
                <el-tooltip effect="light" content="语音">
                  <el-button :icon="audioPlay" @click="speakMessage(message.content)" />
                </el-tooltip>
                <el-tooltip effect="light" content="转为Excel" v-if="message.sender !== username">
                  <el-button @click="saveExcel(message.content)">
                    <svg class="icon" aria-hidden="true">
                      <use xlink:href="#icon-xls1"></use>
                    </svg>
                  </el-button>
                </el-tooltip>
                <el-tooltip effect="light" content="转为DOCX" v-if="message.sender !== username">
                  <el-button @click="saveDOCX(message.content)">
                    <svg class="icon" aria-hidden="true">
                      <use xlink:href="#icon-WORD"></use>
                    </svg>
                  </el-button>
                </el-tooltip>
                <!-- <el-tooltip effect="light" content="搜索" v-if="message.sender !== username">
                  <el-button> 
                   <svg class="icon" aria-hidden="true">
                    <use xlink:href="#icon-network-health-check"></use>
                   </svg>
                  </el-button>
                </el-tooltip> -->
                <el-tooltip effect="light" content="转为流程图" v-if="message.sender !== username">
                  <el-button @click="generatingFlowchart(message.id)" :disabled="!hasUserGeneratePrivilege">
                    <svg class="icon" aria-hidden="true">
                      <use xlink:href="#icon-xingzhuang"></use>
                    </svg>
                  </el-button>
                </el-tooltip>
                <!-- <el-tooltip effect="light" content="转为思维导图" v-if="message.sender !== username">
                  <el-button @click="changeJsMind(message.id)" :disabled="!hasUserGeneratePrivilege">
                    <svg class="icon" aria-hidden="true" style="font-size: 15px">
                      <use xlink:href="#icon-luojituright"></use>
                    </svg>
                  </el-button>
                </el-tooltip> -->
                <el-tooltip effect="light" content="转为思维导图" v-if="message.sender !== username">
                  <el-button @click="changeMarkmapLib(message.id)" :disabled="!hasUserGeneratePrivilege">
                    <svg class="icon" aria-hidden="true" style="font-size: 15px">
                      <use xlink:href="#icon-luojituright"></use>
                    </svg>
                  </el-button>
                </el-tooltip>
                <el-tooltip effect="light" content="转为数据图表" v-if="message.sender !== username">
                  <el-button @click="changeDThreeJs(message.id)">
                    <svg class="icon" aria-hidden="true" style="font-size: 16px">
                      <use xlink:href="#icon-tubiao1"></use>
                    </svg>
                  </el-button>
                </el-tooltip>
                <!-- <el-tooltip effect="light" content="预设指令" v-if="message.sender !== username">
                  <el-button @click="changePromptTemplate" icon="MessageBox">
                  </el-button>
                </el-tooltip> -->
              </template>
              <el-tooltip effect="light" :content="message.showMore ? '收起' : '更多'" v-if="message.sender !== username">
                <el-button @click="message.showMore = !message.showMore" :icon="message.showMore ? 'ArrowLeft' : 'ArrowRight'"></el-button>
              </el-tooltip>
            </div>
            <div class="message-time">{{ message.time }}</div>
          </div>

          <!--  -->
        </div>
        <!-- 联网进度 -->
        <div class="Networking_StepBar" v-if="analysis_Active">
          <el-steps :active="active" align-center finish-status="success">
            <el-step title="开始分析" />
            <el-step title="分析结束" />
          </el-steps>
        </div>
        <div class="chat-affix">
          <!-- <el-affix target=".message-list" position="bottom" :offset="180">
            <el-button
              type="info"
              plain
              icon="CaretTop"
              size="small"
              circle
              @click="scrollToTop"
            ></el-button>
            <el-button
              type="info"
              plain
              icon="CaretBottom"
              size="small"
              circle
              @click="scrollToBottom"
            ></el-button>
          </el-affix> -->
        </div>
      </div>
      <div class="chat-toolbar">
        <el-scrollbar style="flex: 1;" ref="scrollbarRef" width="100%" @wheel="handleWheel">
        <div style="display: flex;align-items: center;">
          <div class="model-select" style="margin-right: 10px;display: flex;align-items: center;">
            <!-- <label>模型选择：</label> -->
            <!-- 选择智能体 -->
            <el-select v-model="selectAgent" style="width: 100px; margin-right: 5px" placement="top">
              <el-option v-for="item in AgentOptions" :key="item.value" :label="item.label" :value="item.value" />  
            </el-select>
            <!-- <el-select v-model="RoomAttributes.llm_model" placeholder="选择模型" style="width: 200px"
              @change="onChangeHandle">
              <el-option v-for="item in options" :key="item.value" :label="item.label" :value="item.value"
                :disabled="item.disabled" />
            </el-select> -->

            <el-popover v-if="selectAgent == '模型选择'" placement="top-start" :width="'60vw'" trigger="click">
              <template #reference>
                <el-button style="margin-right: 16px; width: 200px" @click="onChangeHandle" class="llmModel_button">
                  <img style="height: 15px; width: 15px" :src="modelIcon_name" alt="" />
                  {{ llm_model || "请选择模型" }}</el-button>
              </template>
              <div>
                <el-tabs v-model="activeNameModel" type="border-card" class="demo-tabs" style="height: 300px"
                  @tab-click="onTabChange">
                  <el-tab-pane v-for="(item, index) in modelListAll" :key="item.id" :label="item.id"
                    :name="item.model_brand">
                    <!-- 图标 -->
                    <template #label>
                      <img style="height: 18px; width: 22px" :src="item.image_url" alt="" />
                    </template>
                    <!-- 内容 -->
                    <div style="display: flex; justify-content: space-between;">
                      <el-scrollbar max-height="261px" style="flex: 1;">
                        <div style="width: 100%; min-width: fit-content;">
                          <div class="divDom" :class="{ active: selectedModel === model.id }"
                            @mouseover="hoverModel = model.id" @mouseleave="hoverModel = null"
                            @click="selectModel(model.id, model)" style="
                              height: 50px;
                              display: flex;
                              align-items: center;
                              margin: 5px 0px;
                            " v-for="model in item.model_list" :key="model.id">
                            <img style="
                                height: 25px;
                                width: 61px;
                                margin-left: 5px;
                              " :src="item" v-for="item, index in model.model_tag_images" :key="index" alt="" />
                            <div style="
                                margin: 0px 15px;
                                font-size: 18px;
                                font-weight: 600;
                                color: #000;
                                white-space: nowrap;
                              ">
                              {{ model.model_name }}
                            </div>
                            <el-tag style="margin-right: 5px" effect="dark" size="small" v-if="model.model_config.model_features
      .text_generation
      ">文本</el-tag>
                            <el-tag style="margin-right: 5px" effect="dark" type="danger" size="small" v-if="model.model_config.model_features
      .image_recognition
      ">识图</el-tag>
                            <el-tag style="margin-right: 5px" effect="dark" type="info" size="small" v-if="model.model_config.model_features
      .video_recognition
      ">视频识别</el-tag>
                            <el-tag style="margin-right: 5px" effect="dark" type="success" size="small" v-if="model.model_config.model_features.max_tokens !==
      ''
      ">{{
      model.model_config.model_features.max_tokens
    }}</el-tag>
                            <el-tag style="margin-right: 5px" effect="dark" type="danger" size="small" v-if="model.model_config.model_features
        .image_generation
      ">文生图</el-tag>
                            <!-- <el-tag style="margin-right: 5px" effect="dark" type="info" size="small" v-if="model.model_config.model_features
        .model_max_tokens
      ">{{ model.model_config.model_features.model_max_tokens }}</el-tag> -->
                          </div>
                        </div>
                      </el-scrollbar>
                      <!-- 右边内容 -->
                      <div class="modelDetails" style="white-space: pre-wrap">
                        <div style="
                            height: 30px;
                            width: 200px;
                            position: relative;
                            display: flex;
                            justify-content: center;
                            margin-bottom: 20px;
                          ">
                          <div class="model_title">
                            <img style="height: 15px; width: 15px" :src="TitleIconHref" alt="" />
                            {{ modelTitle }}
                          </div>
                        </div>
                        <el-scrollbar max-height="230px" style="display: flex; justify-content: center">
                          <div>
                            <div class="features_content">
                              {{ formattedModelContent(model_content) }}
                            </div>
                            <div class="features_content" v-if="model_features_content.max_tokens !== '' &&
      content_show
      ">
                              功能：{{ model_features_content.model_traits }}
                            </div>
                            <div class="features_content" v-if="model_features_content.max_tokens !== '/' &&
      content_show
      ">
                              最大上下文(Tokens)：{{
      model_features_content.max_tokens
    }}
                            </div>
                            <div class="features_content" v-if="model_features_content.max_tokens !== 0 &&
      content_show
      ">
                              输入价格(积分/K tokens):{{
      model_features.prompt_cost
    }}
                            </div>
                            <div class="features_content" v-if="model_features_content.max_tokens !== 0 &&
      content_show
      ">
                              输出价格(积分/K tokens):{{
      model_features.completion_cost
    }}
                            </div>
                            <div class="features_content" v-if="model_features_content.max_tokens !== '/' &&
      content_show
      ">
                              Token汇率：{{ model_features_content.token_rate }}
                            </div>
                          </div>
                        </el-scrollbar>
                      </div>
                    </div>
                  </el-tab-pane>
                </el-tabs>
              </div>
            </el-popover>
            <AgentModel v-if="selectAgent == '智能体'" />
          </div>
          <div class="buffer-select" style="display: flex;align-items: center;">
            <label style="white-space: nowrap;">记忆缓存数：</label>
            <el-select v-model="RoomAttributes.memory_buffer_size" placeholder="请选择" style="width: 60px"
              @change="onChangeBufferSize">
              <el-option v-for="i in 51" :key="i" :label="(i - 1).toString()" :value="i - 1">
              </el-option>
            </el-select>
          </div>

          <!-- <div class="networking" v-if="selectAgent == '模型选择'" style="margin-left: 10px;">
            <el-switch style="margin: 4px; --el-switch-on-color: #13ce66;" v-model="connected" />联网
          </div> -->

          <div style="margin:  0px 10px;">
            <el-button type="primary" plain style="width: 88px;" @click="triggerFileInput"
              icon="VideoCameraFilled">图片/视频</el-button>
            <input type="file" ref="fileInput" @change="handleFileUpload" accept="image/*,video/*"
              style="display: none;" />
          </div>
          <div style="flex: 1;"></div>
          <div>
            <!-- 清空 收藏 总结 -->
            <ActionPanel ref="actionPanelRef" :id="activeRoom" @deleteChatHistory="deleteChatHistory"
              :FavoriteList="FavoriteList" @change="onChange" @openPrompt="openPrompt" v-model:mdRenderType="mdRenderType" />
          </div>
        </div>
      </el-scrollbar>
      </div>
      <div class="image-panel" v-if="imageList.length > 0">
        <el-upload class="image-upload" ref="elUploadRef"  accept="image/*" :file-list="imageList" :auto-upload="false" :on-preview="previewImage" :on-remove="removeImage"
         list-type="picture-card" action="" :on-change="changeUpload">
          <el-icon>
            <Plus />
          </el-icon>

        </el-upload>
        <el-dialog v-model="previewVisible">
          <img w-full style="max-width: 100%; max-height: 100%" :src="dialogImageUrl" alt="Preview Image" />
        </el-dialog>
      </div>
      <!-- 视频 -->
      <div class="container" v-if="videoList.length > 0">
        <div class="video-info" @click="clickPreviewVideo(item)" v-for="(item, index) in videoList" :key="index">
          <div class="avatar-container">
            <svg class="icon" aria-hidden="true" style="font-size: 34px">
              <use xlink:href="#icon-shipin"></use>
            </svg>
          </div>
          <div class="video-details">
            <div class="video-name">{{ item.name }}</div>
            <div class="video-size">{{ item.size }}</div>
          </div>
          <div class="close_video" style="padding: 5px;"><el-button size="small" :icon="Delete" circle
              @click="deleteVideo(index)" @click.stop />
          </div>
        </div>
      </div>
      <el-dialog v-model="previewVideoVisible">
        <video controls :src="dialogVideo" style="width: 558px;"></video>
      </el-dialog>

      <div class="input-box">
        <!-- v-if="messageLoading" -->
        <div v-if="messageLoading" style="
            display: flex;
            align-items: center;
            width: 100%;
            justify-content: space-around;
          ">
          <el-progress :percentage="100" :stroke-width="20" :show-text="false" :duration="20" style="width: 95%" striped
            striped-flow />
          <el-button type="danger" circle style="width: 24px; height: 24px; margin-left: 10px" @click="TerminateChat">
            <div style="width: 10px; height: 10px; background: #ffffff"></div>
          </el-button>
        </div>

        <div class="input-box-header" v-if="!messageLoading">
          <el-input v-model="inputMessage" :placeholder="inputPlaceholder" type="textarea" resize="none"
            :autosize="{ minRows: 2, maxRows: 6 }" clearable :disabled="messageLoading"
            @keyup.enter.exact="currentSendMessage" @keydown="messageKeydown" @keydown.shift="changeLine" @paste="handleImagePaste"
            @dragover.prevent >
            <!-- @drop="handleDrop"  -->
          </el-input>
          <div class="input-box-button">
            <el-button class="sendbtn" size="large" type="primary" icon="Position" @click="currentSendMessage">发送文字</el-button>
            <!-- <el-button type="primary" plain :icon="voiceIcon" @mousedown="voiceInput" @mouseup="voiceStop"
              @mouseleave="voiceStop">按住输入语音</el-button> -->
          </div>
        </div>
        <div class="input-box-footer">
          <el-tag :effect="reason ? 'dark' : 'light'" size="large" v-if="selectAgent == '模型选择'" class="tag-btn" round @click="reason = !reason"><div style="display: flex;align-items: center;"><div class="tag-btn-icon mindcraft-flow-win-iconfont icon-mindcraft-shendusikao"></div>深度思考</div></el-tag>
          <el-tag :effect="connected ? 'dark' : 'light'" size="large" v-if="selectAgent == '模型选择'" class="tag-btn" round @click="connected = !connected"><div style="display: flex;align-items: center;"><div class="tag-btn-icon mindcraft-flow-win-iconfont icon-mindcraft-lianwangsousuo"></div>联网搜索</div></el-tag>
          <el-text size="small" type="info">[Shift+Enter] = 换行，[Enter] = 发送信息</el-text>
        </div>
      </div>
    </div>
    <SidePanelLib />
    <!-- 打开流程图弹窗 -->
    <!-- 传递进去语言 -->
    <mermaidDrawer ref="mermaidRef" :mermaidObj="mermaidObj" :mermaidCode="mermaidCode" @resetChart="resetChart" />
    <jsMindDrawer ref="jsMindRef" :jsMindObj="jsMindObj" />
    <EChartsDrawer ref="EChartsRef" :EChartsObj="EChartsObj" @resetChart="resetChart" />
    <excelDrawer ref="ExcelRef" :ExcelObj="ExcelObj" @deleteExcelObj="deleteExcelObj" @resetChart="resetChart" />
    <docxDrawer ref="DocxRef" :DocxObj="DocxObj" @resetChart="resetChart" />
    <markmapLibDrawer ref="MarkmapLibRef" :MarkmapLibObj="MarkmapLibObj" @resetChart="resetChart" />
    <!-- <htmlRunDrwer /> -->
    <PromptTemplateDrawer ref="PromptTemplateRef" />
    <!-- 收藏弹窗 -->
    <el-dialog v-model="collectDialogVisible" title="收藏记录" width="300" center>
      <!-- <span>Open the dialog from the center from the screen</span> -->
      <el-input v-model="collect_name" clearable placeholder="请输入收藏的命名" type="text" style="resize: none" />
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="DefiniteCollection">确定收藏</el-button>
          <el-button @click="deleteCollection"> 取消 </el-button>
        </div>
      </template>
    </el-dialog>

    <div class="search-dialog" v-show="searchDialog">
      <div style="display: flex;align-items: center;width: 100%;justify-content: space-between;">
        <div class="search-dialog-header">搜索结果</div>
        <el-button link icon="close" circle @click="searchDialog = false" class="search-dialog-close"></el-button>
      </div>
      <el-scrollbar style="min-height: 0;flex-shrink: 0;" height="40vh">
        <div style="padding: 12px 0;">
          <el-card style="margin: 12px;" v-for="item in chooseSearchList" :key="item">
            <el-link :underline="false" type="primary" :href="item.href" class="" >{{ item.title }}</el-link>
            <el-link :underline="false" type="info" :href="item.href" class="">{{ item.content }}</el-link>
            <el-text >{{ item.source }}</el-text>
            <el-text >{{ item.time }}</el-text>
          </el-card>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  onMounted,
  nextTick,
  computed,
  provide,
  watch,
  reactive,
  inject,
  onUnmounted,
} from "vue";
import { ElButton, ElTooltip, ElMessage, ElImageViewer } from "element-plus";
import { Search, FolderOpened, SuccessFilled, Delete, VideoCameraFilled } from "@element-plus/icons-vue";
import { useStore } from "vuex";
import SidePanelLib from "./SidePanelLib.vue";
import Room from "./Room.vue";
import StatusBar from "./StatusBar.vue";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import api from "@/utils/request";
import ActionPanel from "./ActionPanel.vue";
import { useUploadFileStore } from "../stores/UploadFile";
import axios from "axios";
import { useMitt } from "../utils/mitt";

import { useLibraryPropertyNameStore } from "../stores/LibraryPropertyName";
import { usePromptPropertyNameStore } from "../stores/PromptPropertyName";
import { useLibraryPropertyStore } from "../stores/LibraryProperty";
import { usePromptPropertyStore } from "../stores/PromptProperty";
import { useUploadFilePathStore } from "../stores/UploadFilePath";
import { userCommandParameterStore } from "../stores/commandParameter";
import { userVipTypeStore } from "../stores/vipType";
import { useGrammarCodesStore } from "../stores/GrammarCodes";
import { useCacheFileStore } from "../stores/cacheFile";

import { renderHtml, codeBlockRegex, htmlTagRegex } from "../utils/MarkdownIt";
import mermaidDrawer from "../components/mermaidDrawer/index.vue";
import jsMindDrawer from "../components/jsMindDrawer/index.vue";
import EChartsDrawer from "../components/EChartsDrawer/index.vue";
import excelDrawer from "./localFileDrawer/excelDrawer.vue";
import docxDrawer from "./localFileDrawer/docxDrawer.vue";
import markmapLibDrawer from "./markmap-LibDrawer/index.vue";
// import htmlRunDrwer from "./codeRun/htmlRunDrwer.vue";
import PromptTemplateDrawer from "./PromptTemplateDrawer/index.vue";
import AgentModel from "./agent_model/index.vue";
import Agent_ECharts from "./agent_chart/agent_ECharts.vue";
import Agent_Mermaid from "./agent_chart/agent_Mermaid.vue";
import Agent_MakmapLib from "./agent_chart/agent_MakmapLib.vue";
import {
  extractMermaidCode,
  chartTypeForMessage,
  extractJsMindCode,
  extractEChartsCode,
  getStraightAnswerContent,
  getPlainContent,
  extractMarkdownCode
} from "@/utils/filterTool";
import {
  getPermission,
  getModel_list,
  postRoomAttribute,
  getModel_list_new,
  postUploadProcessor,
  postStop,
  postAsr,
} from "../api/mainActivity/chat";
import { ElLoading } from "element-plus";
import domtoimage from "dom-to-image";
import { beforeUpload } from "@/utils/fileHandler.js";
import html2canvas from 'html2canvas';
import * as XLSX from "xlsx";

const mitt = useMitt();



//联网样式
const active = ref(0);
const analysis_Active = ref(false);

//折叠
const activeName = ref(["1"]); //折叠默认
const is_collapseItem = ref(false);
const changeCollapse = (val, message) => {
  console.log(message, 'message');
  if (val.includes("2") && message.chart_code?.length > 0) {
    nextTick(() => {
      //点击重新渲染表格
      mitt.emit('openAgent_ECharts');
      mitt.emit('initializeMarkmap');
      mitt.emit('openAgent_Mermaid');
    });
  }
};

const optionsKatex = ref({
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false },
    { left: "\\[", right: "\\]", display: true }
  ],
  ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
  ignoredClasses: ["code-block"],
});

//用ref获取room中activeRoom变量
const room = ref(null); //当前房间
const actionPanelRef = ref(null);
const mermaidRef = ref();
const uploadFiles = ref(""); //上传文件

const PictureAndVideo = ref([])

// const activeRooms = computed(() => room.value?.activeRoom);
const activeRoom = computed(() => (room.value ? room.value.activeRoom : null)); //本来是-1  -1会报错
const selectedRoomName = computed(() => room.value?.selectedRoomName);
const UploadFileStore = useUploadFileStore(); //pinia-UploadFile
const RoomAttributes = ref([]); //请求回来的房间属性
const libraryEchoId = ref([]);
const promptEchoId = ref("");
// 流程图
const mermaidObj = ref(``);
const mermaidCode = ref("");
const limitsOfAuthority = ref([]); //权限数组 模型
const privilege = ref([]); //权限数组 功能

provide("RoomAttributes", RoomAttributes);

// 名字
const LibraryPropertyNameStore = useLibraryPropertyNameStore();
const PromptPropertyNameStore = usePromptPropertyNameStore();
// id
const LibraryPropertyStore = useLibraryPropertyStore();
const PromptPropertyStore = usePromptPropertyStore();

// 路径
// const UploadFilePathStore = useUploadFilePathStore();

const CommandParameterStore = userCommandParameterStore();
const vipTypeStore = userVipTypeStore();

const GrammarCodesStore = useGrammarCodesStore();
const CacheFileStore = useCacheFileStore();

// const loading = ref(false); //加载

const errorMessage = ref("");

//获取LocalStorage中的username
const username = localStorage.getItem("username");
const user_id = localStorage.getItem("user_id");

//联网开关
const connected = ref(false);
// 深度思考
const reason = ref(false);

//store变量初始化
const store = useStore();
const settingsInitialized = computed({
  get: () => store.state.settingsInitialized,
  set: (value) => store.commit("setSettingsInitialized", value),
});
const selectedLibrary = computed({
  get: () => store.state.selectedLibrary,
  set: (value) => store.commit("setSelectedLibrary", value),
});
const selectedPrompt = computed({
  get: () => store.state.selectedPrompt,
  set: (value) => store.commit("setSelectedPrompt", value),
});
const librarySwitch = computed({
  get: () => store.state.librarySwitch,
  set: (value) => store.commit("setLibrarySwitch", value),
});
const promptSwitch = computed({
  get: () => store.state.promptSwitch,
  set: (value) => store.commit("setPromptSwitch", value),
});
//provide侧边栏组件
const sidePanelDrawer = ref(false);
const activeTab = ref(null);
provide("sidePanelDrawer", sidePanelDrawer);
provide("activeTab", activeTab);

const sidePanelLib = ref(false)
provide("sidePanelLib", sidePanelLib);
const openLibrary = () => {
  sidePanelLib.value = true;
}

// const openPrompt = () => {
//   sidePanelDrawer.value = true;
//   activeTab.value = "prompt";
// };

const PromptTemplateRef = ref(null);

const openPrompt = () => {
  // sidePanelDrawer.value = true;
  // activeTab.value = "prompt";
  PromptTemplateRef.value.openPromptTemplate();
};

// 折叠 显示不显示
function shouldShowCollapse(message) {
  const isAgentProcessDataValid =
    message.message_structure?.agent_process_data?.is_agent === true;
  const isMessageStructureNotEmpty =
    message.message_structure &&
    Object.keys(message.message_structure).length > 0;
  return (
    message.sender !== username &&
    isAgentProcessDataValid &&
    isMessageStructureNotEmpty
  );
}

//*上传图片loading************************************************************************************************** */
const fullscreenLoading = ref(false);

let loadingInstance = null;
watch(fullscreenLoading, (newValue) => {
  if (newValue) {
    // 显示Loading，可以通过target参数指定局部DOM元素
    loadingInstance = ElLoading.service({
      fullscreen: true,
      text: "加载中...",
    });
  } else {
    // 隐藏Loading
    if (loadingInstance) {
      loadingInstance.close();
    }
  }
});
//*************************************************************************************************** */

const handleDrop = async (event) => {
  event.preventDefault();
  console.log(event, "event");
  event.preventDefault();
  const files = event.dataTransfer.files;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith("image/")) {
      const imageUrl = URL.createObjectURL(file);
      if (imageUrl) {
        const fileForUpload = {
          name: file.name,
          url: imageUrl,
          raw: file,
        };
        imageList.value.push(fileForUpload);
      }
    } else if (file.type.startsWith('video/')) {

      // 处理视频粘贴
      const videoUrl = URL.createObjectURL(file);
      let fileSize;
      if (file.size > 1024 * 1000) {
        // 大于1000KB，转换为MB
        fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      } else {
        // 小于等于1000KB，保持为KB
        fileSize = (file.size / 1024).toFixed(2) + ' KB';
      } const fileForUpload = {
        name: file.name,
        url: videoUrl,
        raw: file,
        size: fileSize
      };
      videoList.value.push(fileForUpload);

    } else {
      try {
        beforeUpload(file).then((res) => {
          CacheFileStore.addFile(
            res.id,
            res.name,
            res.content,
            res.path,
            res.files_type
          );
          CacheFileStore.addCacheFile(
            res.id,
            res.name,
            res.content,
            res.path,
            res.files_type
          );
          mitt.emit("UploadFileSwitchOn")
          ElMessage.success("已上传文件");
        });
      } catch (error) {
        ElMessage.error("文件上传失败");
      }
    }
  }
};
/***************************************************************************************************** */

let voiceWaiting = ref(false);
let autoSpeak = ref(false);
let mediaRecorder;
let audioChunks = [];

const voiceInput = () => {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      console.log(stream, "stream");
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = []; // 每次录音开始时清空chunks
      mediaRecorder.start();

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        audioChunks = []; // 清空chunks以便下次录音
        await sendAudioToWhisper(audioBlob);
      };

      voiceWaiting.value = true;
      console.log("开始录音...");
    })
    .catch((error) => {
      console.error("获取麦克风权限失败：", error);
      // 提示加打开权限弹窗
      ElMessage.warning("请在系统中 打开麦克风权限");
      //系统打开设置麦克风
      window.electronAPI.openSystemSettings();
    });
};

const voiceStop = () => {
  if (mediaRecorder) {
    mediaRecorder.stop();
    console.log("停止录音...");
  }
};

const sendAudioToWhisper = async (audioBlob) => {

  const formData = new FormData();
  formData.append("file", audioBlob, "recording.amr");
  formData.append("model", "8k_zh");
  // formData.append("update_type", "voice_recog");
  formData.append("category", "tx_asr_recogSentence");
  formData.append("format", "amr");
  formData.append("sample_rate", "8000");
  formData.append("hot_word_list", "腾讯云|10,语音识别|5");

  try {
    const response = await postAsr(formData);
    const data = await response.data.data.text;
    // console.log(response.data.text);
    // console.log(data);

    // const result = data.text;

    // 处理识别结果
    // inputMessage.value = result;
    inputMessage.value = data;
    autoSpeak.value = true;
    // console.log('语音识别结果：', result);
    sendMessage();
  } catch (error) {
    console.error("语音识别错误：", error);
    if (error?.response?.status === 400) {
      ElMessage.warning(error.response.data.message);
    }
  } finally {
    voiceWaiting.value = false;
  }
};

const voiceIcon = computed(() => {
  return voiceWaiting.value ? "Loading" : "Microphone";
});
// 设置临时id
const tempID = ref("temp_id");
//重新发送信息
const refreshMessage = async (message) => {
  // console.log(message);
  // tempID.value = message.id;
  tempID.value = message.id;
  if (Array.isArray(message.files) && message.files.length > 0) {
    // console.log(message.files,'message.files');
    // imageList.value = [message.images_data];
    PictureAndVideo.value.push(...message.files);
  }
  inputMessage.value = message.content;
  if (selectAgent.value === '模型选择') {
    await sendMessage();
  } else {
    await agent_sendMessage();
  }
};
let editingMessageId = ref(null);
const startEditing = (id) => {
  editingMessageId.value = id;
};
const endEditing = (id) => {
  editingMessageId.value = null;
};
const editMessage = (id, newContent) => {
  // console.log(id, newContent, "6666666666666666");
  api
    .post(`llm/edit_message/${id}/`, { content: newContent })
    .then((response) => {
      if (response.status === 200) {
        // 更新messages中的信息
        const message = messages.value.find((message) => message.id === id);
        if (message) {
          message.content = "" + newContent + "";
        }
        editingMessageId.value = null;
        ElMessage("消息修改成功");
      } else {
        console.error("服务器没有返回数据");
      }
    })
    .catch((error) => {
      console.error(error);
    });
};
const copyMessage = async (text) => {
  // const chartElement = document.getElementById(`test${messageId}`).querySelector('.echarts-for-react');
  try {
    await navigator.clipboard.writeText(text);
    ElMessage("已复制到剪贴板");
  } catch (error) {
    console.error("复制失败:", error);
  }
};

// const copyTextAndChart = async (messageId) => {
//   const messageElement = document.getElementById(`test${messageId}`);
//   if (messageElement) {
//     try {
//       const canvas = await html2canvas(messageElement);
//       canvas.toBlob(async (blob) => {
//         const item = new ClipboardItem({ 'image/png': blob });
//         await navigator.clipboard.write([item]);
//         ElMessage("文本和图表已复制到剪贴板");
//       });
//     } catch (error) {
//       console.error("复制文本和图表失败:", error);
//     }
//   } else {
//     ElMessage("未找到消息内容");
//   }
// };
/*上传视频做处理**************************************************************************************************************************** */
const fileInput = ref(null);
const previewVideoVisible = ref(false);
const dialogVideo = ref("")

const videoList = ref([]);

const triggerFileInput = () => {
  if(imageList.value.length==0){
    fileInput.value.click();
  }else{
    // 触发el-upload的上传
    elUploadRef.value.$el.querySelector('input').click()
  }
};

// 点击上传图片/视频
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    // 处理文件上传逻辑
    // 判断是图片还是视频
    const uid = file.uid || Date.now() + Math.floor(Math.random() * 1000);
    if (file.type.startsWith('image/')) {
      const imageUrl = URL.createObjectURL(file);
      if (imageUrl) {
        const fileForUpload = {
          name: file.name,
          url: imageUrl,
          raw: file,
          uid:uid
        };
        imageList.value.push(fileForUpload);
      }
    } else if (file.type.startsWith('video/')) {
      // console.log('是视频');
      // 处理视频粘贴
      const videoUrl = URL.createObjectURL(file);
      let fileSize;
      if (file.size > 1024 * 1000) {
        // 大于1000KB，转换为MB
        fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      } else {
        // 小于等于1000KB，保持为KB
        fileSize = (file.size / 1024).toFixed(2) + ' KB';
      } 
      const fileForUpload = {
        name: file.name,
        url: videoUrl,
        raw: file,
        size: fileSize,
        uid:uid
      };
      videoList.value.push(fileForUpload);
    }
  }

  // 清空input的值
  event.target.value = '';
};

const clickPreviewVideo = (item) => {
  // console.log(item, 'item');
  dialogVideo.value = item.url;
  previewVideoVisible.value = true;
}

const deleteVideo = (index) => {
  // console.log(index, 'index');
  videoList.value.splice(index, 1);
}














































/******************************************************************************************************************************* */



const md = MarkdownIt();
const copyHtml = async (markdown) => {
  try {
    // const html = md.render(markdown);
    const html = renderHtml(markdown);
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([html], { type: "text/plain" }),
      }),
    ]);
    ElMessage("已复制到剪贴板");
    console.log(markdown);
  } catch (error) {
    console.error("复制失败:", error);
  }
};
const deleteMessage = (id) => {
  // Delete message logic
  // 删除信息
  api
    .delete(`llm/delete_message/${id}/`)
    .then((response) => {
      if (response.status === 204) {
        // 删除messages中的信息
        messages.value = messages.value.filter((message) => message.id !== id);
        ElMessage("信息已删除");
      } else {
        console.error("服务器没有返回数据");
      }
    })
    .catch((error) => {
      console.error(error);
    });
};

//用TTS播放语音
let utterance = new SpeechSynthesisUtterance(null);
let isSpeaking = ref(false);
const audioPlay = computed(() => {
  return isSpeaking.value ? "VideoPause" : "VideoPlay";
});
const speakMessage = (text) => {
  //如果正在播放语音，则停止播放
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    if (utterance.text === text) {
      isSpeaking.value = false;
      return;
    }
  }
  utterance.text = text; // Update the text property of the utterance
  utterance.lang = "zh-CN";
  utterance.rate = 1.2;
  utterance.pitch = 1.2;
  utterance.volume = 1;
  utterance.onstart = () => {
    isSpeaking.value = true;
  };
  utterance.onend = () => {
    isSpeaking.value = false;
  };
  speechSynthesis.speak(utterance);
};

//模型选择
const llm_model = ref("GPT-3.5-Turbo");
const options = computed(() => [
  {
    value: "GPT-3.5-Turbo",
    label: "GPT-3.5-Turbo (16K)",
    disabled: !limitsOfAuthority.value.includes("GPT-3.5-Turbo"),
  },
  {
    value: "GPT-4-Turbo",
    label: "GPT-4-Turbo (128K)",
    disabled: !limitsOfAuthority.value.includes("GPT-4-Turbo"),
  },
  {
    value: "DALL-E-3",
    label: "DALL-E-3(绘图)",
    disabled: !limitsOfAuthority.value.includes("DALL-E-3"),
  },
  {
    value: "GPT-4-V",
    label: "GPT-4-V(识图)",
    disabled: !limitsOfAuthority.value.includes("GPT-4-V"),
  },
]);
const hasUserGeneratePrivilege = computed(() => {
  return privilege.value.includes("use_generate");
});

// 打开绘图版
const openNewWindow = () => {
  window.electronAPI.openPaint();
  // router.push({ name: "ApplicationCanvas" });
};

const inputMessage = ref("");
// 滚动条设置到底部
const chatContentRef = ref(null);
const chatContent = computed(() => chatContentRef.value);
const needScrollBottom = ref(true)
const scrollToBottom = () => {
  if(!needScrollBottom.value) {
    return
  }
  nextTick(() => {
    chatContent.value.scrollTop = chatContent.value.scrollHeight;
    needScrollBottom.value = true
  });
};
const changeScrollBottom = () => {
  needScrollBottom.value = chatContent.value.scrollTop + chatContent.value.clientHeight >= chatContent.value.scrollHeight
}
onMounted(() => {
  chatContentRef.value?.addEventListener("scroll", changeScrollBottom)
})
onUnmounted(() => {
  chatContentRef.value?.removeEventListener("scroll", changeScrollBottom)
})
const scrollToTop = () => {
  nextTick(() => {
    chatContent.value.scrollTop = 0;
  });
};
// 创建响应式变量
const messages = ref([]); //聊天记录
const currentPage = ref(1); //分页
const total = ref(0); //总条数

const thinkId = ref(null); //思考id
const chooseThinkId = (id) => {
  thinkId.value = thinkId.value == id ? null : id;
}

const chooseSearchList = ref([])
const searchDialog = ref(false)
const openSearchDialog = (data) => {
  console.log('openSearchDialog', data);
  chooseSearchList.value = []
  searchDialog.value = false
  setTimeout(() => {
    chooseSearchList.value = data?.search_list || []
    searchDialog.value = true
  }, 100);
}

//触发loadMore
const handleScroll = (event) => {
  if (event.target.scrollTop === 0) {
    loadMore();
  }
};

onMounted(async (event) => {
  // 阻止浏览器默认的拖拽行为
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => event.preventDefault());
  chatContent.value.addEventListener("scroll", handleScroll);
  // console.log(messages.value, 'messages.value');
  userPermission();
  getModelList();
  CacheFileStore.init();
});

// 获取历史消息
const getChatHistory = async (page) => {
  // if (!page) return;
  const chatPosition = chatContent.value?.scrollHeight;
  try {
    const response = await api.get(
      `llm/get_chat_history/${activeRoom.value}/?page=${currentPage.value}`
    );
    // console.log(response.data.results, 'response.data.results');

    if (response.data.results) {
      total.value = response.data.count; //聊天数量

      let data = response.data.results.reduce((acc, item) => {
        item.files = item.images_data ? JSON.parse(item.images_data) : [];
        // item.images = JSON.parse(item.images);
        // item.files =  JSON.parse(item.files);
        item.activeName = ["1"];
        const hasAgentThinkTag = /<agentThink\s*\/>|<generatePicture\s*\/>/.test(item.content);
        item.is_collapse = hasAgentThinkTag;
        acc[item.id] = item;
        // 处理 item.content
        item.content = item.content ? item.content.replace(/\\\((.*?)\\\)/g, (match, p1) => {
          // 将 p1 中的所有 \ 替换为 \\
          p1 = p1.replace(/\\/g, '\\\\');
          return `$${p1}$`;
        }) : "";
        
        item.think = item.content.split("<think>")[1] || ''
        item.think = item.think.split("</think>")[0] || '';
        item.displayContent = item.content.replaceAll(item.think, "") || ""
        item.displayContent = item.displayContent.replaceAll('<think>', "") || ""
        item.displayContent = item.displayContent.replaceAll('</think>', "") || ""

        return acc;
      }, {});

      // console.log(data,'data>>>>>>');

      // 将存储消息的对象转换为数组
      let dataArray = Object.values(data);
      dataArray.push(...messages.value);
      // 按照时间戳从小到大进行排序
      dataArray.sort((a, b) => a.time - b.time);
      messages.value = dataArray;
      // console.log(messages.value);
      await nextTick();
      const totalHeight = chatContent.value.scrollHeight;
      chatContent.value.scrollTop = totalHeight - chatPosition;
      console.log(messages.value, 'messages.value');
    } else {
      console.error("服务器没有返回数据");
      ElMessage.warning("没有更多信息");
    }
  } catch (error) {
    console.error(error);
  }
};

let flag = false;

// 监听activeRoom房间变化,获取聊天记录,并滚动到底部
watch(
  activeRoom,
  async (newValue) => {
    if (newValue) {
      flag = true;
      currentPage.value = 1;
      messages.value = [];
      await getChatHistory(currentPage.value);
      // console.log("已请求聊天记录");
      scrollToBottom();
      flag = false;
    }
  },
  { immediate: true }
);

// 聊天窗口滚动到顶部，currentPage+1，加载更多历史消息
const loadMore = async () => {
  if (flag) return;
  currentPage.value += 1; //聊天分页+1

  // 计算请求最大页
  let totalHistory = 20;
  const maxPages = Math.ceil(total.value / totalHistory);
  // 判断当前页数是否超过最大页数
  if (currentPage.value > maxPages) {
    return;
  }

  // 获取历史记录
  await getChatHistory();
};

/*************************************************************************************************************** */

//定义一个变量来存储上一次的房间属性
// let lastRoomAttributes = null;
// let lastLibraryId = null;
// let lastPromptId = null;
let lastOtherConfig = null;

import { Conf } from 'electron-conf/renderer'
// 请求得到房间属性
const getRoomAttributes = async () => {
  if (!activeRoom.value) return;
  try {
    const response = await api.get(
      `/llm/get_room_attributes/${activeRoom.value}/`
    );
    if (response.status === 200) {
      RoomAttributes.value = response.data;
      const conf = new Conf()
      const model = await conf.get("publicDefaultModel") || ""
      if(!RoomAttributes.value.llm_model) {
        if(model) {
          RoomAttributes.value.llm_model = model
        } else {
          if(modelListAll.value.length) {
            RoomAttributes.value.llm_model = modelListAll.value?.[0]?.model_list?.[0]?.model_name || ''
          }
        }
      }
      // console.log(RoomAttributes.value, '回显的数组 当前房间的数组');

      // 联网
      // const web_search_switch = JSON.parse(response.data.other_config);
      // const web_search_switch_ = JSON.parse(web_search_switch.other_config);
      // // console.log(web_search_switch_.connected,'web_search_switch_');
      // connected.value = web_search_switch_.connected;
      // // console.log(connected.value,'web_search_switch');

      // // 保存上次请求回来的 other_config
      // lastOtherConfig = JSON.parse(response.data.other_config);

      // 检查 other_config 是否存在且是一个有效的 JSON 字符串
      if (response.data.other_config && typeof response.data.other_config === 'string') {
        try {
          const web_search_switch = JSON.parse(response.data.other_config);
          if (web_search_switch && web_search_switch.other_config) {
            const web_search_switch_ = JSON.parse(web_search_switch.other_config);
            connected.value = web_search_switch_.connected;
            reason.value = web_search_switch_.reason;
          }
          // 保存上次请求回来的 other_config
          lastOtherConfig = web_search_switch;
        } catch (parseError) {
          console.error('Parsing error in other_config:', parseError);
        }
      }

      console.log(RoomAttributes.value, 'web_search_switch');
      // library 请求
      if (RoomAttributes.value.library) {
        api.get("/llm/get_library_list_by_user/").then((res) => {
          // var library_list = res.data.created;
          var combinedLibraryList = [...res.data.created, ...res.data.followed];
          // console.log(combinedLibraryList,'combinedLibraryList');
          const library_listAttr = combinedLibraryList.find(
            (item) => item.id == RoomAttributes.value.library
          );
          LibraryPropertyNameStore.setLibraryName(library_listAttr.index_name); //拿到文件名
        });
        LibraryPropertyStore.setLibraryID(RoomAttributes.value.library);
        // LibraryPropertyStore.setTop_K(RoomAttributes.value.library_top_k);
      } else {
        LibraryPropertyNameStore.setLibraryName("知识库");
        LibraryPropertyStore.deleteLibraryID(); // 清空
        LibraryPropertyStore.deleteTop_K();
      }
      // instruction请求
      if (RoomAttributes.value.instruction) {
        api.get("/llm/get_instruction_prompt_list_by_user/").then((res) => {
          // var prompt_list = res.data.created;
          var combinedPromptList = [...res.data.created, ...res.data.followed];
          const prompt_listAttr = combinedPromptList.find(
            (item) => item.id == RoomAttributes.value.instruction
          );
          // console.log(prompt_listAttr.prompt_name,'prompt_listAttr.prompt_name');
          PromptPropertyNameStore.setPromptName(prompt_listAttr.prompt_name); //拿到文件名
        });
        PromptPropertyStore.setPromptId(RoomAttributes.value.instruction);
      } else {
        PromptPropertyNameStore.setPromptName("预设指令");
        PromptPropertyStore.deletePromptId(); //清空
      }
      //判断文件路径
      if (response.data.file_path) {
        CacheFileStore.filterCacheFile(response.data.file_path); //拿进去 ID
        // console.log(JSON.parse(response.data.file_path),'response.data.file_path');
      } else {
        CacheFileStore.clearCacheFile(); //清空
      }
      if (response.data.other_config) {
        // console.log("进来了");
      } else {
        // console.log("没进来");
      }
    }
  } catch (error) {
    console.log(error);
  }
};

// 修改
const updateRecordRoomProperties = async () => {
  if (!activeRoom.value || activeRoom.value == "-1") return;

  if (RoomAttributes.value.length === 0) {
    await getRoomAttributes(); // 如果RoomAttributes.value是空数组，则先获取房间属性
  }

  // 判断当前房间的房间号是否在房间list里面，有就过去 没有直接return
  const rooms = room.value?.chatRooms;
  const defaultID = room.value?.defaultID;
  const foundRoom = rooms.find((room) => room.id == defaultID);
  if (!foundRoom) return;

  const id = room.value?.defaultID;
  const libraryId = LibraryPropertyStore.libraryID; //知识库id
  const promptId = PromptPropertyStore.promptId; //预设指令id
  const CacheFile_id = CacheFileStore.filterCacheFileID(); //保存id
  // const library_top_k = LibraryPropertyStore.Top_K;

  const footData = {
    connected: connected.value,
    reason: reason.value,
  };

  const AttributeAll = {
    id: RoomAttributes.value.id,
    room: RoomAttributes.value.room,

    file_path: CacheFileStore.filterCacheFileID(),
    file_switch: RoomAttributes.value.file_switch,
    instruction: PromptPropertyStore.promptId, //预设指令id
    instruction_switch: RoomAttributes.value.instruction_switch,
    instruction_name: RoomAttributes.value.instruction_name,
    libraryId: LibraryPropertyStore.libraryID, //知识库id
    library_switch: RoomAttributes.value.library_switch,
    library_name: RoomAttributes.value.library_name,
    // library_top_k: LibraryPropertyStore.Top_K,
    llm_model: RoomAttributes.value.llm_model,
    memory_buffer_size: RoomAttributes.value.memory_buffer_size,
    other_config: JSON.stringify(footData),
  };
  const isModified = JSON.stringify(lastOtherConfig) !== JSON.stringify(AttributeAll);
  // console.log(lastOtherConfig, "JSON.stringify(lastOtherConfig)");
  // console.log(
  //   Test,
  //   "JSON.stringify(JSON.parse(RoomAttributes.value.other_config))"
  // );
  if (!isModified) {
    console.log("数据相同，无需修改");
    return;
  }

  try {
    // console.log(RoomAttributes.value,'updateRecordRoomProperties');
    await api.post(`/llm/update_room_attributes/${id}/`, {
      ...RoomAttributes.value,
      library: String(libraryId),
      instruction: String(promptId),
      file_path: JSON.stringify(CacheFile_id),
      // library_top_k: library_top_k,
      other_config: JSON.stringify(AttributeAll),
    });
  } catch (error) {
    console.log(error);
  }
};

/******************************************************************************************************************** */
// 收藏数组
const FavoriteList = ref([]);
const collectDialogVisible = ref(false);
const collect_name = ref("未命名收藏");
const collect_id = ref("");

// 点击收藏 按钮的回调
const collectContent = async (id) => {
  collect_id.value = id;
  collectDialogVisible.value = true;
};

// 弹窗确定的逻辑
const DefiniteCollection = () => {
  const collect = messages.value.find((item) => item.id === collect_id.value);
  // console.log(collect.chart_code, 'collect');
  try {
    const imageUrls =
      collect.files?.length > 0
        ? collect.files.map((image) => image)
        : [];
    // console.log(imageUrls,'imageUrls');
    api.post(`/llm/add_favorite_message`, {
      title: collect_name.value,
      related_room: selectedRoomName.value,
      message: collect.content,
      image: JSON.stringify(imageUrls),
      other_config: JSON.stringify(collect.chart_code)
    });
    // console.log(collect,'collect');
    collectDialogVisible.value = false;
    ElMessage.success("收藏成功");
    collect_name.value = "未命名收藏";
  } catch (error) {
    console.log(error);
    ElMessage.error("收藏失败");
  }
};
// 取消
const deleteCollection = () => {
  collectDialogVisible.value = false;
  collect_name.value = "未命名收藏";
};

// 原来在这里

//按房间号删除聊天信息
const deleteChatHistory = async () => {
  try {
    const response = await api.delete(
      `llm/delete_chat_history/${activeRoom.value}/`,
      {
        headers: {},
      }
    );
    if (response.status === 204) {
      // console.log('deleteChatByRoom成功删除聊天信息');
      messages.value = [];
      ElMessage.success("聊天信息已清空");
    } else {
      console.error("服务器没有返回数据");
    }
  } catch (error) {
    console.error(error);
  }
};

// 建立一个函数，获取最近buffer_size条消息，并加载到一个数组中
const buffer_size = ref(8); //默认值为N条
const getBufferMessages = () => {
  messages.value.sort((a, b) => a.time - b.time); //排序
  const recentMessages = messages.value.slice(-buffer_size.value);
  const buffer_messages = recentMessages
    .map((message) => {
      if (message.send_type === "message") {
        return {
          sender: message.sender,
          content: message.content,
        };
      }
    })
    .filter((message) => message);

  // console.log(buffer_messages,'buffer_messages>>>>>>>>..');
  const prefixed_messages = {
    chat_history: buffer_messages,
  };
  return JSON.stringify(prefixed_messages);
};

// 把图片数组过滤出来
const getBufferImages = () => {
  messages.value.sort((a, b) => a.time - b.time); // 按时间排序
  const recentMessages = messages.value.slice(-buffer_size.value); // 获取最近的消息
  // console.log(recentMessages,'recentMessages>>>>>>>>>.');
  const buffer_Images = recentMessages
    .map((message, index, array) => {
      if (
        message.send_type === "message" &&
        message.images &&
        message.images.length > 0
      ) {
        // 尝试获取下一条消息的信息
        const nextMessage = array[index + 1];
        if (nextMessage) {
          return [
            { sender: message.sender, images: message.images },
            { sender: nextMessage.sender, content: nextMessage.content },
          ];
        } else {
          return [{ sender: message.sender, images: message.images }];
        }
      }
    })
    .filter((message) => message); // 过滤掉未定义或不满足条件的结果
  const prefixed_Images = {
    chat_history: buffer_Images.flat(),
  };
  return JSON.stringify(prefixed_Images);
};

//根据message_id获取最近buffer_size条消息，并加载到一个数组中，用于刷新消息
const getBufferMessagesByID = (message_id) => {
  const index = messages.value.findIndex(
    (message) => message.id === message_id
  );
  const recentMessages = messages.value
    .slice(index - buffer_size, index)
    .reverse();
  const buffer_messages = recentMessages.map((message) => ({
    sender: message.sender,
    content: message.content,
  }));
  const prefixed_messages = {
    chat_history: buffer_messages,
  };
  return JSON.stringify(prefixed_messages);
};
// 指令获取
const initial_prompt = ref("response_format: 用Markdown语言回答;");
let instruction_prompt = ref("");
let llm_temperature = ref(0.2);
// 格式化指令
const formatPersonalizedPrompt = (prompt) => {
  let parsedPrompt;
  try {
    parsedPrompt = JSON.parse(prompt);
  } catch (e) {
    console.error("Failed to parse prompt:", e);
    return {};
  }
  return parsedPrompt;
};
const formatCustomizedPrompt = (prompt) => {
  const parsedPrompt = JSON.parse(prompt);
  return parsedPrompt.reduce((obj, item) => {
    obj[item.key] = item.value;
    return obj;
  }, {});
};
const getPrompt = (selectedPrompt) => {
  return new Promise((resolve, reject) => {
    api
      .get(`llm/get_instruction_prompt_detail/${selectedPrompt}/`, {})
      .then((response) => {
        // 在这里处理响应数据
        if (response.data.prompt_type === "standard") {
          instruction_prompt.value = response.data.standard_prompt;
        } else if (response.data.prompt_type === "personalized") {
          instruction_prompt.value = formatPersonalizedPrompt(
            response.data.personalized_prompt
          );
        } else if (response.data.prompt_type === "customized") {
          instruction_prompt.value = formatCustomizedPrompt(
            response.data.customized_prompt
          );
        }
        //给instruction_prompt添加prefix: instructions:
        instruction_prompt.value =
          "instructions: " + JSON.stringify(instruction_prompt.value);
        llm_temperature.value = response.data.llm_temperature / 100;
        resolve();
      })
      .catch((error) => {
        // 处理错误
        console.error(error);
        reject(error);
      });
  });
};
// 语义搜索
let semantic_search_answer = [];
let semantic_search_list = ref([]);
let inputQuery = ref(""); // 用于语义搜索的query
provide("semantic_search_list", semantic_search_list);
provide("inputQuery", inputQuery);
const topK = computed({
  get: () => store.state.topK,
  set: (value) => store.commit("setTopK", value),
});
//用semantic_search获取知识库信息
const getLibraryData = (inputQuery) => {
  return new Promise((resolve, reject) => {
    const searchQuery = {
      query: inputQuery,
      // top_k: topK.value,
      // openai_api_key: openai_api_key,
      // openai_api_base: openai_api_base,
    };
    api
      .post(`llm/semantic_search/${selectedLibrary.value}/`, searchQuery, {
        headers: {},
      })
      .then((response) => {
        // 在这里处理响应数据
        const search_list = response.data;
        resolve(search_list);
      })
      .catch((error) => {
        // 处理错误
        console.error(error);
        reject(error);
      });
  });
};
//输入框换行功能
const enterShift = ref(false)
let shiftTimer = null;
const changeLine = (event) => {
  clearTimeout(shiftTimer);
  enterShift.value = true;
  shiftTimer = setTimeout(() => {
    enterShift.value = false
  }, 300);
  if (event.key === "Enter") {
    // inputMessage.value = inputMessage.value + "\n";
  }
};
//等待信息反馈
const messageLoading = ref(false);
const imageList = ref([]);
// const fileList = ref([
//   {
//     name: "element-plus-logo.svg",
//     url: "https://element-plus.org/images/element-plus-logo.svg",
//   },
// ]);
// let imageUrlList = ref([]);
// const imageList = (['https://oaidalleapiprodscus.blob.core.windows.net/private/org-4Hwxqh1tVtdhnZwG0mnyeuly/user-eUm62fVkSiVvzJtBOhn3gJ16/img-6CX5PVthEfeybVNbxZ8a2Eqc.png?st=2023-11-26T12%3A15%3A08Z&se=2023-11-26T14%3A15%3A08Z&sp=r&sv=2021-08-06&sr=b&rscd=inline&rsct=image/png&skoid=6aaadede-4fb3-4698-a8f6-684d7786b067&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2023-11-25T20%3A21%3A13Z&ske=2023-11-26T20%3A21%3A13Z&sks=b&skv=2021-08-06&sig=/gixRigRkr8zd/ZQJ9Pybe39x4tlvkJa6%2Bzow/s32aU%3D']);
const inputPlaceholder = computed(() => {
  return messageLoading.value ? "等待信息反馈..." : "请输入信息";
});
//获取API信息
// let openai_api_key = localStorage.getItem("openai_api_key");
// let openai_api_base = localStorage.getItem("openai_api_base");
// const getAPI = async () => {
//   if (!localStorage.getItem("openai_api_key")) {
//     await api
//       .get("llm/get_api_info/")
//       .then((res) => {
//         if (res.status === 200) {
//           //将API信息存储到本地
//           localStorage.setItem("openai_api_key", res.data.openai_api_key);
//           localStorage.setItem("openai_api_base", res.data.openai_api_base);
//           openai_api_key = localStorage.getItem("openai_api_key");
//           openai_api_base = localStorage.getItem("openai_api_base");
//           //打印日志，获取API信息
//           console.log("加载API信息成功");
//         }
//       })
//       .catch((err) => {
//         ElMessage.error("加载API信息失败");
//       });
//   }
// };
onMounted(async () => {
  // await getAPI();
  // await Attributes_buffer_size();
  // await Attributes_llm_model()
});

// 上传显示删除
const tagClose = (index) => {
  uploadFiles.value?.fileList.splice(index, 1);
};
// 总结
const onChange = async () => {
  await sendMessage();
  actionPanelRef.value.dialogVisible = false;
  actionPanelRef.value.SummarizeContent = "";
};

const standard_prompt = ref("");
const temperature = ref(null); //温度参数
let stochastic = "tempID2";
const stop_id = ref("");
const beforeProcessed = ref(false); // 标志变量，记录是否已经处理过 <before> 标签

import { useCreateRoomName } from "@/hook/room/useCreateRoomName.js"

const messageKeydown = (e) => {
  if(e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
  }
}

//发送消息
const sendMessage = async (e) => {
  if(enterShift.value) return
  //检查 chatRooms房间 是否为空
  if (room?.value.chatRooms.length === 0 || room?.value.activeRoom === "") {
    ElMessage.warning("请新建房间 或 选择已有房间,才可以输入");
    return;
  }
  // 判断当前输入框是否为空 和 图片的list数组是否为0
  if (
    inputMessage.value.trim() ||
    imageList.value.length > 0 ||
    actionPanelRef.value.dialogVisible ||
    mermaidRef.value.dialogMermaid ||
    videoList.value.length > 0
  ) {
    //打印条件状态
    // console.log('librarySwitch:', librarySwitch.value);
    // console.log('selectedLibrary:', selectedLibrary.value);

    actionPanelRef.value.dialogVisible = false;

    needScrollBottom.value = true;

    // 获取历史记录buffer
    const buffer_messages = ref("");
    buffer_messages.value = getBufferMessages();

    const buffer_images = ref("");
    buffer_images.value = getBufferImages();

    // 保存房间属性
    await RoomAttribute();

    // let PictureAndVideo = [];
    messageLoading.value = true;
    const imageUrlList = await uploadImages(imageList.value);
    const videoUrlList = await uploadVideo(videoList.value);
    PictureAndVideo.value.push(...imageUrlList, ...videoUrlList);

    // console.log(PictureAndVideo, 'PictureAndVideo>>>>>>>>>>>>>');
    // console.log(videoUrlList,'videoUrlList>>>>>>>>>>>>>..');
    // console.log(imageUrlList, "imageUrlList发送里>>>>>>>>>>..33333");
    fullscreenLoading.value = false; //关闭全局loading

    // 同时判断 总结消息 和 流程图消息
    if (
      actionPanelRef.value.SummarizeContent ||
      mermaidRef.value.mermaidContent
    ) {
      inputMessage.value =
        actionPanelRef.value.SummarizeContent ||
        mermaidRef.value.mermaidContent;
    } else {
      actionPanelRef.value.SummarizeContent = "";
      mermaidRef.value.mermaidContent = "";
    }

    // 判断上传文件
    const upload_files = ref([]);
    // const upload_files1 = ref("");
    if (store.state.fileSwitch === "On") {
      upload_files.value = CacheFileStore.filterCacheFileContents();
      // upload_files1.value = CacheFileStore.filterCacheFileContents();
      // console.log(upload_files.value, "upload_files.value>>>>>>>>>>>>>>.");
    } else {
      // 清空
      upload_files.value = [];
    }
    // 判断知识库
    const libraryID = ref("");
    // const libraryTop_k = ref("");
    if (librarySwitch.value === "On") {
      libraryID.value = LibraryPropertyStore.libraryID;
      // libraryTop_k.value = LibraryPropertyStore.Top_K;
    } else {
      libraryID.value = "";
      // libraryTop_k.value = "";
    }

    // 判断预设指令
    const promptId = ref("");
    if (promptSwitch.value === "On") {
      promptId.value = PromptPropertyStore.promptId;
    } else {
      promptId.value = "";
    }

    //创建发送的message对象
    const userMessage = {
      message_id: tempID.value, //赋予临时id，等待服务器返回id并赋值
      library_id: String(libraryID.value), //文件id
      prompt_id: promptId.value, //文件id
      // library_top_k: String(libraryTop_k.value), //返回结果数量
      send_type: "message",
      sender: username,
      room_id: activeRoom.value, //房间id
      llm_model: llm_model.value, //模型
      // content: inputMessage.value?.replace(/(?<!\n)\n(?!\n)/g, '\n\n') || "", //内容
      content: inputMessage.value, //内容
      // images: JSON.stringify(imageUrlList), //图片
      // images_data: JSON.stringify(imageUrlList),
      files: JSON.stringify(PictureAndVideo.value),
      history_length: String(buffer_size.value), //读取历史记录消息
      file_prompt: JSON.stringify(upload_files.value), //上传文件
      chat_stream: true,
      web_search: connected.value,
      reason: reason.value,
      url_version: "1.2",
    };

    // console.log(userMessage, 'userMessage');
    let demo = Object.assign({}, userMessage, { id: userMessage.message_id });
    demo.files = JSON.parse(demo.files)

    if (!messages.value.some((item) => item.id === demo.id)) {
      messages.value.push(demo);
    }
    // 判断messages.value

    // 赋值给query用于语义搜索
    inputQuery.value = inputMessage.value;
    // 清空语义搜索列表
    semantic_search_answer = [];
    semantic_search_list.value = [];
    // 清空指令
    instruction_prompt.value = "";
    // 清空输入框
    inputMessage.value = "";
    imageList.value = [];
    videoList.value = [];
    PictureAndVideo.value = [];

    // 禁止输入信息，等待反馈
    messageLoading.value = true;
    // console.log('sendMessage():messageLoading', messageLoading.value)
    // 滚动到底部
    scrollToBottom();

    //发送信息
    try {
      // /llm/chat/agent/
      const response = await api.post("/v1/llm/", userMessage, {
        responseType: "stream",
        onDownloadProgress: (progressEvent) => {
          // console.log(progressEvent.event.target.status,'progressEvent');
          const chunk = progressEvent.event.currentTarget.response;
          // console.log(chunk);

          stop_id.value = extractPrefix(chunk);
          // console.log(stop_id.value);

          const regexBefore = "<before>";
          const endRegexBefore = "</before>";
          if (chunk.includes(regexBefore) && !beforeProcessed.value) {
            // console.log("进来了");
            analysis_Active.value = true;
            scrollToBottom();
            const content = chunk.split("<before>")[1].split("</before>")[0];
            if (content) {
              const lines = content.split("\n");
              lines.forEach((line) => {
                if (line.includes("问题分析:开始")) {
                  // 做一些操作
                  active.value = 1;
                  // console.log("问题分析开始");
                }
                if (line.includes("问题分析:完成")) {
                  active.value = 2;
                }
              });

              if (chunk.includes(endRegexBefore)) {
                // console.log("结尾</before>");
                analysis_Active.value = false;
                beforeProcessed.value = true;
              }
            } else {
              // console.log('等于false');
            }
          }

          const searchListBefore = "<search_list>";
          const endsearchListBefore = "</search_list>";
          let searchList = null;
          if(chunk.includes(searchListBefore)) {
            try {
              let content = chunk.split(searchListBefore)[1]?.split(endsearchListBefore)[0]?.replace(/\n/g, "");
              searchList = JSON.parse(content)
            } catch (error) {
              searchList = null
            }
          }

          const regexContent = "<content>";
          if (chunk.includes(regexContent)) {
            // 做判断 聊天部分部分
            let content = chunk.split("<content>")[1].split("</content>")[0];
            // console.log(content,'content>>>>>>>>>>>.');

            if(!chunk.includes("<end>")) {
              content = content.replace('<think>', '<div class="think-value">')
              content = content.replace('</think>', '</div>')
            }

            //判断 判断如果遇见\( \)开头结尾的 之间换\\ 前后加$
            content = content.replace(/\\\((.*?)\\\)/g, (match, p1) => {
              // 将 p1 中的所有 \ 替换为 \\
              p1 = p1.replace(/\\/g, '\\\\');
              return `$${p1}$`;
            });

            // console.log(content, '流式content');

            let messageIndex = messages.value.findIndex(
              (message) => message.id === stochastic
            );

            if (messageIndex !== -1) {
              // 更新已有消息的内容
              messages.value[messageIndex].content = content;
            } else {
              const serverMessage = {
                content: content,
                search_list: searchList,
                send_type: "message",
                id: stochastic,
              };
              // console.log('走进来这里');
              messages.value.push(serverMessage);
            }

            scrollToBottom();
            // console.log(response.data,'response>>>>>>>>>>>..');
            const regex = "<end>";
            if (chunk.includes(regex) && chunk.includes("</end>")) {
              const result = extractJsonFromResponse(chunk);
              if (!result) return;

              analysis_Active.value = false;
              beforeProcessed.value = true;

              // console.log(result, 'result');
              // console.log(result.user_message_id, 'result.user_message_id');

              // console.log(messages.value,'messages.value查看一下');

              let messageIndex1 = messages.value.findIndex(
                (message) => message.id === tempID.value
              );
              //将response.data.user_message_id赋值给临时id的message
              messages.value[messageIndex1].id = result.user_message_id;

              let messageIndex2 = messages.value.findIndex(
                (message) => message.id === stochastic
              );

              let resultContent = result?.content?.replace(/\\\((.*?)\\\)/g, (match, p1) => {
                // 将 p1 中的所有 \ 替换为 \\
                p1 = p1.replace(/\\/g, '\\\\');
                return `$${p1}$`;
              });
              let think = resultContent.split("<think>")[1] || ''
              think = think.split("</think>")[0] || '';
              let displayContent = resultContent.replaceAll(think, "") || ""
              displayContent = displayContent.replaceAll('<think>', "") || ""
              displayContent = displayContent.replaceAll('</think>', "") || ""

              const serverMessages = {
                id: result.id,
                content: resultContent,
                think,
                search_list: searchList,
                displayContent,
                files: result.files ? JSON.parse(result.files) : null,
                sender: result.sender,
                time: result.time,
                llm_model: result.llm_model,
                usage: result.usage,
                stop_reason: result.stop_reason,
                send_type: result.send_type,
                temperature: result.temperature,
              };

              // console.log(result, '最后覆盖');

              if (messageIndex2) {
                messages.value[messageIndex2] = {
                  ...messages.value[messageIndex2],
                  ...serverMessages,
                };
                // Object.assign(messages.value[messageIndex2], serverMessage);
              }
              scrollToBottom(); // 滚动到底部
              beforeProcessed.value = false;
            }
          } else if (progressEvent.event.target.status === 201) {
            // console.log("走进来这里了 图片");
            const res = JSON.parse(chunk);
            // console.log(res, "res");

            const serverMessage = {
              id: res.id,
              content: res.content,
              files: res.images_data ? JSON.parse(res.images_data) : null,
              sender: res.sender,
              time: res.time,
              llm_model: res.llm_model,
              usage: res.usage,
              stop_reason: res.stop_reason,
              send_type: res.send_type,
              temperature: res.temperature,
            };

            let messageIndex1 = messages.value.findIndex(
              (message) => message.id === tempID.value
            );
            messages.value[messageIndex1].id = res.user_message_id;

            messages.value.push(serverMessage);
            // console.log(messages.value, "messages.value");
            scrollToBottom(); // 滚动到底部

          }
        },
      });
      // console.log(messages.value, "messages.value》》》》》》》》》》》》》》》》");
    } catch (error) {
      if (axios.isCancel(error)) return;
      console.error("请求错误:", error);
      // 处理错误 同样错误不要push一样得
      const existingError = messages.value.find(
        (message) => message.content === error.message
      );
      if (!existingError) {
        errorMessage.value = error.message;
        messages.value.push({ content: errorMessage, error: true });
      }
      if (error?.response?.status === 406) {
        const errorMessage = JSON.parse(error.response.data);
        ElMessage.warning(errorMessage.message);
        let messageIndex1 = messages.value.findIndex(
          (message) => message.id === tempID.value
        );
        messages.value[messageIndex1].id = errorMessage.user_message_id;
      }
      if (error?.response?.status === 400) {
        const errorMessage = JSON.parse(error.response.data);
        ElMessage.warning(errorMessage.message);

        let messageIndex1 = messages.value.findIndex(
          (message) => message.id === tempID.value
        );
        messages.value[messageIndex1].id = errorMessage.user_message_id;
      }
      scrollToBottom();
    } finally {
      messageLoading.value = false;
      tempID.value = "temp_id";

      const { createRoomName } = useCreateRoomName()
      createRoomName({
        roomName: selectedRoomName.value,
        messages: messages.value,
        roomId: activeRoom.value,
      })
    }
  } else {
    ElMessage.warning("发送内容不能为空");
  }
};

function extractJsonFromResponse(responseData) {
  const jsonString = responseData.split("<end>")[1].split("</end>")[0].trim();
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON解析错误:", error);
    return null;
  }
}

const extractPrefix = (data) => {
  const regex = /<stop>(\d+-\d+)<\/stop>/;
  const match = data.match(regex);
  if (match) {
    return match[1];
  }
  return null;
};
/* 智能体************************************************************************************************************************ */

const agent_BeingProcessed = ref("1");

//智能体发送消息
const agent_sendMessage = async () => {
  console.log("agent_智能体");
  //检查 chatRooms房间 是否为空
  if (room?.value.chatRooms.length === 0 || room?.value.activeRoom === "") {
    ElMessage.warning("请新建房间 或 选择已有房间,才可以输入");
    return;
  }
  // 判断当前输入框是否为空 和 图片的list数组是否为0
  if (
    inputMessage.value.trim() ||
    imageList.value.length > 0 ||
    actionPanelRef.value.dialogVisible ||
    mermaidRef.value.dialogMermaid ||
    videoList.value.length > 0
  ) {
    actionPanelRef.value.dialogVisible = false;

    needScrollBottom.value = true;

    // 获取历史记录buffer
    const buffer_messages = ref("");
    buffer_messages.value = getBufferMessages();

    const buffer_images = ref("");
    buffer_images.value = getBufferImages();

    // 保存房间属性
    await RoomAttribute();

    messageLoading.value = true;
    const imageUrlList = await uploadImages(imageList.value);
    const videoUrlList = await uploadVideo(videoList.value);
    PictureAndVideo.value.push(...imageUrlList, ...videoUrlList);

    fullscreenLoading.value = false; //关闭全局loading

    // 同时判断 总结消息 和 流程图消息
    if (
      actionPanelRef.value.SummarizeContent ||
      mermaidRef.value.mermaidContent
    ) {
      inputMessage.value =
        actionPanelRef.value.SummarizeContent ||
        mermaidRef.value.mermaidContent;
    } else {
      actionPanelRef.value.SummarizeContent = "";
      mermaidRef.value.mermaidContent = "";
    }

    // 判断上传文件
    const upload_files = ref([]);
    // const upload_files1 = ref("");
    if (store.state.fileSwitch === "On") {
      upload_files.value = CacheFileStore.filterCacheFileContents();
    } else {
      // 清空
      upload_files.value = [];
    }
    // 判断知识库
    const libraryID = ref("");
    // const libraryTop_k = ref("");
    if (librarySwitch.value === "On") {
      libraryID.value = LibraryPropertyStore.libraryID;
      // libraryTop_k.value = LibraryPropertyStore.Top_K;
    } else {
      libraryID.value = "";
      // libraryTop_k.value = "";
    }

    // 判断预设指令
    const promptId = ref("");
    if (promptSwitch.value === "On") {
      promptId.value = PromptPropertyStore.promptId;
    } else {
      promptId.value = "";
    }

    //创建发送的message对象
    const userMessage = {
      message_id: tempID.value, //赋予临时id，等待服务器返回id并赋值
      library_id: String(libraryID.value), //文件id
      prompt_id: promptId.value, //文件id
      room_id: activeRoom.value, //房间id
      history_length: String(buffer_size.value), //读取历史记录消息
      content: inputMessage.value, //内容
      // images: JSON.stringify(imageUrlList), //图片
      // images_data: JSON.stringify(imageUrlList),
      files: JSON.stringify(PictureAndVideo.value),
      file_prompt: JSON.stringify(upload_files.value), //上传文件
      send_type: "message",
      sender: username,
    };

    let demo = Object.assign({}, userMessage, { id: userMessage.message_id });
    // demo.images = JSON.parse(demo.images);
    // demo.images_data = JSON.parse(demo.images_data);
    demo.files = JSON.parse(demo.files)

    if (!messages.value.some((item) => item.id === demo.id)) {
      messages.value.push(demo);
    }
    // 判断messages.value

    // 赋值给query用于语义搜索
    inputQuery.value = inputMessage.value;
    // 清空语义搜索列表
    semantic_search_answer = [];
    semantic_search_list.value = [];
    // 清空指令
    instruction_prompt.value = "";
    // 清空输入框
    inputMessage.value = "";
    imageList.value = [];
    videoList.value = [];
    PictureAndVideo.value = [];
    // 禁止输入信息，等待反馈
    messageLoading.value = true;
    // 滚动到底部
    scrollToBottom();

    //发送信息
    try {
      const response = await api.post("/llm/chat/agent/", userMessage, {
        responseType: "stream",
        onDownloadProgress: (progressEvent) => {
          is_collapseItem.value = false;
          // console.log(progressEvent.event.target.status,'progressEvent');
          const chunk = progressEvent.event.currentTarget.response;
          // console.log(chunk);
          stop_id.value = extractPrefix(chunk);

          const regexContent = "<content>";
          if (chunk.includes(regexContent)) {
            // 做判断 聊天部分部分
            let content = chunk.split("<content>")[1].split("</content>")[0];

            // <agentThink/>
            const startAgentThink = "<agentThink />"
            if (chunk.includes(startAgentThink)) {
              is_collapseItem.value = true;
              agent_BeingProcessed.value = "1";
              console.log("agentThink标签");
            }

            // <search>搜索内容</search> # 搜索中
            const startWebSearch = "<webSearch>";
            if (chunk.includes(startWebSearch)) {
              agent_BeingProcessed.value = "2";
            }

            const startGenerateChart = "<generateChart />"; //空格问题
            if (chunk.includes(startGenerateChart)) {
              agent_BeingProcessed.value = "3";
              // console.log("渲染图表中~");
            }

            const startGeneratePicture = "<generatePicture>";
            if (chunk.includes(startGeneratePicture)) {
              is_collapseItem.value = true;
              agent_BeingProcessed.value = "5";
              // console.log("渲染图中~");
            }

            const startRecognitionPicture = "<recognitionPicture>";
            if (chunk.includes(startRecognitionPicture)) {
              agent_BeingProcessed.value = "6";
              // console.log("识别图中~");
            }

            //判断 判断如果遇见\( \)开头结尾的 之间换\\ 前后加$
            content = content.replace(/\\\((.*?)\\\)/g, (match, p1) => {
              // 将 p1 中的所有 \ 替换为 \\
              p1 = p1.replace(/\\/g, '\\\\');
              return `$${p1}$`;
            });
            // console.log(content, 'content');
            let messageIndex = messages.value.findIndex(
              (message) => message.id === stochastic
            );

            if (messageIndex !== -1) {
              // 更新已有消息的内容
              messages.value[messageIndex].content = content;
              messages.value[messageIndex].message_structure.agent_process_data.status_category = agent_BeingProcessed.value;
              messages.value[messageIndex].is_collapse = is_collapseItem.value;
            } else {
              const serverMessage = {
                content: content,
                send_type: "message",
                id: stochastic,
                message_structure: {
                  agent_process_data: {
                    is_agent: true,
                    status_category: agent_BeingProcessed.value,
                  },
                },
                activeName: activeName.value,
                is_collapse: is_collapseItem.value,
              };
              // console.log('走进来这里');
              messages.value.push(serverMessage);
              console.log(messages.value,'messages.value>>>>');
            }

            scrollToBottom();
            // console.log(response.data,'response>>>>>>>>>>>..');
            const regex = "<end>";
            if (chunk.includes(regex) && chunk.includes("</end>")) {
              agent_BeingProcessed.value = "4";

              // console.log(agent_BeingProcessed.value,'agent_BeingProcessed.value>>>');

              setTimeout(() => {
                activeName.value.push("2");
                mitt.emit('openAgent_ECharts');
                mitt.emit('initializeMarkmap');
                mitt.emit('openAgent_Mermaid');
              }, 2000)
              const result = extractJsonFromResponse(chunk);
              if (!result) return;

              // console.log(result, 'result>>>>>>>>>>>>>>>..');

              console.log(result,'result');

              let messageIndex1 = messages.value.findIndex(
                (message) => message.id === tempID.value
              );
              //将response.data.user_message_id赋值给临时id的message
              messages.value[messageIndex1].id = result.user_message_id;

              let messageIndex2 = messages.value.findIndex(
                (message) => message.id === stochastic
              );

              let resultContent = result?.content?.replace(/\\\((.*?)\\\)/g, (match, p1) => {
                // 将 p1 中的所有 \ 替换为 \\
                p1 = p1.replace(/\\/g, '\\\\');
                return `$${p1}$`;
              });

              const serverMessages = {
                id: result.id,
                content: resultContent,
                files: result.images_data ? JSON.parse(result.images_data) : null,
                sender: result.sender,
                time: result.time,
                llm_model: result.llm_model,
                usage: result.usage,
                stop_reason: result.stop_reason,
                send_type: result.send_type,
                temperature: result.temperature,
                message_structure:result.message_structure
              };

              if (messageIndex2) {
                messages.value[messageIndex2] = {
                  ...messages.value[messageIndex2],
                  ...serverMessages,
                  activeName: activeName.value,
                };
              }
              // console.log(messages.value, "messages.value>>>>>>>>>>>");
              scrollToBottom(); // 滚动到底部
              beforeProcessed.value = false;
            }
          } else if (progressEvent.event.target.status === 201) {
            // console.log("走进来这里了 图片");
            const res = JSON.parse(chunk);
            // console.log(res, "res");
            const serverMessage = {
              id: res.id,
              content: res.content,
              files: res.images_data ? JSON.parse(res.images_data) : null,
              sender: res.sender,
              time: res.time,
              llm_model: res.llm_model,
              usage: res.usage,
              stop_reason: res.stop_reason,
              send_type: res.send_type,
              temperature: res.temperature,
            };

            let messageIndex1 = messages.value.findIndex(
              (message) => message.id === tempID.value
            );
            messages.value[messageIndex1].id = res.user_message_id;

            messages.value.push(serverMessage);
            console.log(messages.value, "messages.value");
            scrollToBottom(); // 滚动到底部
          }
        },
      });
      console.log(messages.value, "messages.value");
    } catch (error) {
      if (axios.isCancel(error)) return;
      console.error("请求错误:", error);
      // 处理错误 同样错误不要push一样得
      const existingError = messages.value.find(
        (message) => message.content === error.message
      );
      if (!existingError) {
        errorMessage.value = error.message;
        messages.value.push({ content: errorMessage, error: true });
      }
      if (error?.response?.status === 406) {
        const errorMessage = JSON.parse(error.response.data);
        ElMessage.warning(errorMessage.message);
        let messageIndex1 = messages.value.findIndex(
          (message) => message.id === tempID.value
        );
        messages.value[messageIndex1].id = errorMessage.user_message_id;
      }
      if (error?.response?.status === 400) {
        const errorMessage = JSON.parse(error.response.data);
        ElMessage.warning(errorMessage.message);
        let messageIndex1 = messages.value.findIndex(
          (message) => message.id === tempID.value
        );
        messages.value[messageIndex1].id = errorMessage.user_message_id;
      }

      // console.log(error.response.data.error);
      // 滚动到底部
      scrollToBottom();
    } finally {
      messageLoading.value = false;
      tempID.value = "temp_id";
      console.log("finally");
    }
  } else {
    ElMessage.warning("发送内容不能为空");
  }
};

/*************************************************************************************************************************** */

// 修改原地房间属性
const RoomAttribute = async () => {
  if (!activeRoom.value || activeRoom.value == "-1") return;

  const libraryId = LibraryPropertyStore.libraryID; //知识库id
  const promptId = PromptPropertyStore.promptId; //预设指令id
  const CacheFile_id = CacheFileStore.filterCacheFileID(); //保存id

  const footData = {
    connected: connected.value,
    reason: reason.value,
  };
  const AttributeAll = {
    id: RoomAttributes.value.id,
    room: RoomAttributes.value.room,

    file_path: CacheFileStore.filterCacheFileID(),
    file_switch: RoomAttributes.value.file_switch,
    instruction: PromptPropertyStore.promptId, //预设指令id
    instruction_switch: RoomAttributes.value.instruction_switch,
    instruction_name: RoomAttributes.value.instruction_name,
    libraryId: LibraryPropertyStore.libraryID, //知识库id
    library_switch: RoomAttributes.value.library_switch,
    library_name: RoomAttributes.value.library_name,
    // library_top_k: LibraryPropertyStore.Top_K,
    llm_model: RoomAttributes.value.llm_model,
    memory_buffer_size: RoomAttributes.value.memory_buffer_size,
    other_config: JSON.stringify(footData),
  };
  const isModified = JSON.stringify(lastOtherConfig) !== JSON.stringify(AttributeAll);
  // console.log(lastOtherConfig, "JSON.stringify(lastOtherConfig)");
  // console.log(
  //   Test,
  //   "JSON.stringify(JSON.parse(RoomAttributes.value.other_config))"
  // );
  if (!isModified) {
    console.log("数据相同，无需修改");
    return;
  }

  try {
    await postRoomAttribute(activeRoom.value, {
      ...RoomAttributes.value,
      library: String(libraryId),
      instruction: String(promptId),
      file_path: JSON.stringify(CacheFile_id),
      other_config: JSON.stringify(AttributeAll),
    });
  } catch (error) {
    console.log(error);
  }
};

// 处理粘贴图片
const handleImagePaste = (event) => {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;
  for (let index in items) {
    const item = items[index];
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) {
        const uid = Date.now() + Math.floor(Math.random() * 1000);
        if (file.type.indexOf("image") !== -1) {
          // 处理图片粘贴
          const imageUrl = URL.createObjectURL(file);
          const fileForUpload = {
            name: file.name,
            url: imageUrl,
            raw: file,
            uid:uid
            // file_type:file.type
          };
          if(imageList.value.length==0){
            imageList.value.push(fileForUpload); 
          }else{
            // 更新el-upload图片
            elUploadRef.value.handleStart(file)
          }
        } else if (file.type.indexOf("video") !== -1) {
          // 处理视频粘贴
          const videoUrl = URL.createObjectURL(file);
          let fileSize;
          if (file.size > 1024 * 1000) {
            // 大于1000KB，转换为MB
            fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
          } else {
            // 小于等于1000KB，保持为KB
            fileSize = (file.size / 1024).toFixed(2) + ' KB';
          } const fileForUpload = {
            name: file.name,
            url: videoUrl,
            raw: file,
            size: fileSize,
            uid:uid
            // file_type:file.type
          };
          videoList.value.push(fileForUpload);
          console.log(videoList.value, 'videoList.value');
        }
      }
    }
  }
};

// 获取预签名URL和公网URL
// async function getPresignedUrl() {
//   // 调用后端接口获取预签名URL和公网URL
//   const response = await api.get("cos-presigned-url/");
//   return response.data;
// }
// 上传图片到COS并获取公网URL
async function uploadImages(filesArray) {
  // console.log(filesArray, 'filesArray');

  fullscreenLoading.value = true; // 开启全局loading
  const uploadImageUrls = [];
  const formData = new FormData();
  let hasFiles = false;
  filesArray.forEach((file) => {
    if (typeof file === "object" && file.raw) {
      // 检查文件类型是否为图片
      if (file.raw.type && file.raw.type.startsWith("image/")) {
        formData.append("files[]", file.raw);
        hasFiles = true;
      }
    } else if (Array.isArray(file)) {
      // 如果是链接数组，直接添加到 uploadImageUrls
      file.forEach((url) => uploadImageUrls.push(url));
    }
  });

  formData.append("update_type", "file_url");

  if (hasFiles) {
    // 只有在有图片文件时才发请求
    try {
      const res = await postUploadProcessor(formData);
      // res.data.data.forEach((item) => {
      //   uploadImageUrls.push(item.file_url);
      // });
      uploadImageUrls.push(...res.data.data);
    } catch (error) {
      console.error("上传错误：", error.response ? error.response.data : error);
    } finally {
      fullscreenLoading.value = false; // 关闭全局loading
    }
  } else {
    fullscreenLoading.value = false; // 没有图片文件时也关闭loading
  }

  return uploadImageUrls;
}

const uploadVideo = async (filesArray) => {
  // console.log(filesArray, 'filesArray');

  fullscreenLoading.value = true; // 开启全局loading
  const uploadVideoUrls = [];
  const formData = new FormData();
  let hasFiles = false;

  filesArray.forEach((file) => {
    if (typeof file === "object" && file.raw) {
      if (file.raw.type && file.raw.type.startsWith("video/")) {
        formData.append("files[]", file.raw);
        hasFiles = true;
      }
    } else if (Array.isArray(file)) {
      file.forEach((url) => uploadVideoUrls.push(url));
    }
  });

  formData.append("update_type", "file_url");

  if (hasFiles) {
    try {
      const res = await postUploadProcessor(formData);
      uploadVideoUrls.push(...res.data.data);
    } catch (error) {
      console.error("上传错误：", error.response ? error.response.data : error);
    } finally {
      fullscreenLoading.value = false; // 关闭全局loading
    }
  } else {
    fullscreenLoading.value = false;
  }

  return uploadVideoUrls;
}

const elUploadRef= ref()
const changeUpload = (val)=>{
  const event = {
    target:{
      files:[val.raw]
    }
  }
  handleFileUpload(event)
}
// 上传视频到COS获取链接

const dialogImageUrl = ref("");
const previewVisible = ref(false);
//el-upload中的预览imageList图片，用el-dialog实现
const previewImage = (uploadFile) => {
  dialogImageUrl.value = uploadFile.url;
  previewVisible.value = true;
};
//  删除图片
const removeImage = (uploadFile)=>{
  const curRemoveIndex  = imageList.value.findIndex(e=>e.uid===uploadFile.uid)
  if(curRemoveIndex>=-1){
    imageList.value.splice(curRemoveIndex,1)
  }
}
// 拿到模型
watch(
  () => RoomAttributes.value.llm_model,
  (newVal) => {
    llm_model.value = newVal;
  },
  { immediate: true }
);
// 拿到记忆存储
const onChangeBufferSize = (val) => {
  buffer_size.value = val;
  // console.log(val);
};
watch(
  () => RoomAttributes.value.memory_buffer_size,
  (newVal) => {
    buffer_size.value = newVal;
  },
  { immediate: true }
);
// 拿到知识库按钮
const offHandle = (name, show) => {
  RoomAttributes.value[name] = show === "On";
};
// 拿到预设指令按钮
const OffPrompt = (name, show) => {
  RoomAttributes.value[name] = show === "On";
};
// 拿到上传文件开关
const off_FileSwitch = (name, show) => {
  RoomAttributes.value[name] = show === "On";
};

// const activeAPI = ref(false);
//intializedVisible等于settingsIntialized的反向
// const initializedVisible = computed(() => !settingsInitialized.value);
//监听activeRoom和activeAPI的变化，当两者都为true时，设置settingsInitialized为true
// onMounted (async () => {
//   await api.post('llm/set_api_info_cache/', {}, {
//     headers: {}
//   })
//   .then(response => {
//     if (response.data.message === "API信息缓存成功") {
//       console.log('API信息缓存成功');
//       activeAPI.value = true;
//     } else if (response.data.error === "未读取到API KEY") {
//       // console.error('未读取到API KEY');
//       // ElMessage.error('未读取到API KEY');
//     }
//   })
//   .catch(error => {
//     // 处理错误情况
//   });

//   watchEffect(() => {
//     settingsInitialized.value = activeRoom.value && activeAPI.value;
//   });
// });

// const extractHeadline = (data) => {
//   const regex = /^[^\n]+/;
//   const match = data.match(regex);
//   if (match) {
//     return match[0];
//   } else {
//     return null;
//   }
// };

const update_messageId = ref("");

//生成流程图
const generatingFlowchart = async (id) => {
  // const content = messages.value.find(item => item.id == id);//拿到当前的内容
  try {
    messageLoading.value = true;
    const res = await api.post("/llm/generate/", {
      message_id: id,
      room_id: activeRoom.value,
      generate_type: "Mermaidjs",
    });
    messages.value.push(res.data);
    messageLoading.value = false;

    // 滚动到底部
    scrollToBottom();
  } catch (error) {
    console.log(error);
    ElMessage({
      showClose: true,
      message: error.response.data.message,
      type: "warning",
      duration: 0,
    });
    messageLoading.value = false;
  }
};

//点击打开弹窗流程图
const openFlowDiagram = (id) => {
  update_messageId.value = id;
  const content = messages.value.find((item) => item.id == id); //拿到当前的内容
  mermaidCode.value = content.content;
  mermaidObj.value = extractMermaidCode(content.content);
  // 赋值给pinia
  GrammarCodesStore.setMermaidGrammar(mermaidObj.value);
  mitt.emit("open_flowDiagram"); //打开抽屉流程图
};

// 用户权限
const userPermission = () => {
  const access_token = localStorage.getItem("access_token");
  getPermission(access_token)
    .then((response) => {
      limitsOfAuthority.value = response.data.user_permission?.models;
      privilege.value = response.data.user_permission?.privilege;
      vipTypeStore.setFontlibraryList(response.data.user_vip);
      vipTypeStore.setPrivilege(response.data.user_permission?.privilege);
    })
    .catch((error) => {
      console.log(error);
    });
};

//充值成功 调用函数
mitt.on("userPermission", () => {
  // console.log("chat 触击到了");
  userPermission();
});

// 截屏函数
const screenCapture = async (id) => {
  // nextTick(() => {
  //   let node = document.getElementById(`test${id}`);
  //   node.style.maxWidth = "none";
  //   fullscreenLoading.value = true; // 开启全局loading
  //   domtoimage
  //     .toBlob(node, { with: "100%" })
  //     .then((blob) => {
  //       try {
  //         const item = new ClipboardItem({ "image/png": blob });
  //         navigator.clipboard
  //           .write([item])
  //           .then(() => {
  //             console.log("图片已复制到剪贴板");
  //             node.style.maxWidth = "80%";
  //             ElMessage.success("图片已复制到剪贴板");
  //           })
  //           .catch((error) => {
  //             console.error("复制到剪贴板失败", error);
  //             node.style.maxWidth = "80%";
  //           });
  //         fullscreenLoading.value = false; // 开启全局loading
  //       } catch (error) {
  //         console.error("剪贴板操作失败", error);
  //         node.style.maxWidth = "80%";
  //         fullscreenLoading.value = false; // 开启全局loading
  //       }
  //     })
  //     .catch((error) => {
  //       console.error("生成图片失败", error);
  //       node.style.maxWidth = "80%";
  //       fullscreenLoading.value = false; // 开启全局loading
  //     });
  // });
  const messageElement = document.getElementById(`test${id}`);
  fullscreenLoading.value = true; // 开启全局loading
  if (messageElement) {
    try {
      const canvas = await html2canvas(messageElement);
      canvas.toBlob(async (blob) => {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        ElMessage.success("图片已复制到剪贴板");
        fullscreenLoading.value = false; // 开启全局loading
      });
    } catch (error) {
      console.error("复制图片到剪贴板失败:", error);
      fullscreenLoading.value = false; // 开启全局loading

    }
  } else {
    ElMessage("未找到消息内容");
    fullscreenLoading.value = false; // 开启全局loading
  }
};

const jsMindRef = ref(null);
const jsMindObj = ref({});

//生成思维导图
const changeJsMind = async (id) => {
  // jsMindRef.value.OpenDrawer();
  try {
    messageLoading.value = true;
    const res = await api.post("/llm/generate/", {
      message_id: id,
      room_id: activeRoom.value,
      generate_type: "jsMind",
    });
    messages.value.push(res.data);
    messageLoading.value = false;
    // 滚动到底部
    scrollToBottom();
  } catch (error) {
    console.log(error);
    ElMessage({
      showClose: true,
      message: error.response.data.message,
      type: "warning",
      duration: 0,
    });
    messageLoading.value = false;
  }
};
// 转流程图 Open流程图弹窗
const openJsMind = (id) => {
  // let jsMindContent =  ``;
  const content = messages.value.find((item) => item.id == id); //拿到当前的内容
  // jsMindObj.value = extractJsMindCode(content.content);
  // console.log(jsMindObj.value,'jsMindObj.value');
  const res = extractJsMindCode(content.content);
  // console.log(res,'res');
  // jsMindObj.value = JSON.parse(content.content);
  jsMindObj.value = JSON.parse(res);
  // console.log(jsMindObj.value, "jsMindObj.value");

  jsMindRef.value.OpenDrawer();
};

/*转为echarts*********************************************************************** */
const EChartsRef = ref(null);
const EChartsObj = ref({});
const changeDThreeJs = async (id) => {
  // EChartsRef.value.OpenDrawer();
  try {
    messageLoading.value = true;
    const res = await api.post("/llm/generate/", {
      message_id: id,
      room_id: activeRoom.value,
      generate_type: "ECharts",
    });
    messages.value.push(res.data);
    messageLoading.value = false;
    // 滚动到底部
    scrollToBottom();
  } catch (error) {
    ElMessage({
      showClose: true,
      message: error.response.data.message,
      type: "warning",
      duration: 0,
    });
    messageLoading.value = false;
  }
};

const openDThreeJs = (id) => {
  update_messageId.value = id;
  const content = messages.value.find((item) => item.id == id); //拿到当前的内容
  const res = extractEChartsCode(content.content);
  // console.log(res,'res');
  // EChartsObj.value = JSON.parse(res);
  if (typeof res === "JSON") {
    // console.log("是不是json数据");
  }
  EChartsObj.value = JSON.parse(res);
  console.log(EChartsObj.value, "EChartsObj.value");
  EChartsRef.value.OpenDrawer();
};
/*模型处理**************************************************************** */
const activeNameModel = ref("欧朋AI");
const modelListAll = ref([]);
// const getThroughModel = ref([]);

// 模型种类
const getModelList = async () => {
  const res = await getModel_list_new();
  modelListAll.value = res.data;
  // console.log(modelListAll.value, 'modelListAll.value');
};

// 模型选中逻辑
const selectedModel = ref(null);
const hoverModel = ref(null);
const model_content = ref("");
const modelTitle = ref("");
// 内容
const model_features_content = ref({});
const model_features = ref({});
const content_show = ref(true);

// 选中
const selectModel = (modelId, model) => {
  content_show.value = true;
  selectedModel.value = modelId;
  llm_model.value = model.model_name;
  RoomAttributes.value.llm_model = model.model_name;

  //内容
  model_content.value = model.model_config.model_content;
  // console.log(model.model_config.model_features_content,'model>>>>>>>>>>>>.');
  model_features_content.value = model.model_config.model_features_content;
  model_features.value = model.model_config.model_features;
};
const onChangeHandle = () => {
  let foundModelId = null;
  let modelContent = null; // 添加变量来存储model_content
  let brandName = null; // 添加变量来存储品牌名称

  const matchingModel = modelListAll.value.find((item) =>
    item.model_list.some(
      (model) => model.model_name === RoomAttributes.value.llm_model
    )
  );

  if (matchingModel) {
    // 如果找到匹配的模型，再次查找具体的模型来获取id和其他信息
    const model = matchingModel.model_list.find(
      (model) => model.model_name === RoomAttributes.value.llm_model
    );
    if (model) {
      foundModelId = model.id;
      modelContent = model.model_config.model_content; // 假设model_config存储了你需要的model_content
      brandName = model.model_config.chat_brand; // 获取品牌名称
      model_features_content.value = model.model_config.model_features_content;
      model_features.value = model.model_config.model_features;
    }
  }
  activeNameModel.value = brandName; // 品牌
  selectedModel.value = foundModelId; // 选中ID
  model_content.value = modelContent; // 内容
  modelTitle.value = brandName; //内容
};

const formattedModelContent = (text) => {
  return text?.replace(/-/g, "") || '';
};

const onTabChange = (tab) => {
  // console.log(tab, 'tab');
  modelTitle.value = tab.props.name;
  model_content.value = "";
  model_features_content.value = {};
  model_features.value = {};
  content_show.value = false;
};

/*换icon的********************************************************************* */
const TitleIconHref = computed(() => {
  const foundModel = modelListAll.value.find((model) =>
    model.model_list.some(
      (subModel) => subModel.model_config.chat_brand === modelTitle.value
    )
  );
  // 如果找到了匹配的模型，返回其image_url
  if (foundModel) {
    return foundModel.image_url;
  }
});

const modelIcon_name = computed(() => {
  const foundModel = modelListAll.value.find((model) =>
    model.model_list.some(
      (subModel) => subModel.model_config.model_name === llm_model.value
    )
  );
  //console.log(llm_model.value,'llm_model.value');
  //console.log(foundModel,'foundModel');
  if (foundModel) {
    return foundModel.image_url;
  }
});

import {cancelRequest} from '@/utils/request';
// 终止问答
const TerminateChat = async () => {
  cancelRequest();
  await postStop(stop_id.value);
  // 把还是临时 id 的消息改成唯一值，避免下次发送被去重逻辑拦截
  messages.value.forEach((m) => {
    if (m.id === tempID.value || m.id === 'tempID2') {
      m.id = `cancelled_${Date.now()}_${Math.random()}`;
    }
  });
  ElMessage.warning("停止回答");
};

/*保存表格 文档 文件******************************************************************************************** */

const ExcelRef = ref(null);
const DocxRef = ref(null);
const ExcelObj = ref([]);
const DocxObj = ref(``);

const jsonData = [
  { name: "John", age: 30, city: "New York" },
  { name: "Anna", age: 22, city: "London" },
  { name: "Mike", age: 32, city: "Chicago" },
];
const saveExcel = async (text) => {
  const html = md.render(text);
  console.log(html, 'html');
  // 创建一个 DOM 解析器
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  // 创建一个新的工作簿
  const workbook = XLSX.utils.book_new();

  // 提取所有元素
  const elements = doc.body.children;

  const data = [];

  // 按顺序提取内容
  Array.from(elements).forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'p' || tagName === 'h3') {
      data.push([element.textContent]);
      data.push([]); // 插入空行
    } else if (tagName === 'ol' || tagName === 'ul') {
      const listItems = element.querySelectorAll('li');
      listItems.forEach((li) => {
        data.push([li.textContent]);
      });
      data.push([]); // 插入空行
    } else if (tagName === 'pre') {
      const codeElement = element.querySelector('code');
      if (codeElement) {
        const preContent = codeElement.textContent.trim();
        const preData = preContent.split('\n').map(line => [line]);
        data.push(...preData);
        data.push([]); // 插入空行
      }
    } else if (tagName === 'table') {
      const tableData = [];
      const rows = element.querySelectorAll('tr');
      rows.forEach((row) => {
        const rowData = [];
        const cells = row.querySelectorAll('th, td');
        cells.forEach((cell) => {
          rowData.push(cell.textContent.trim());
        });
        tableData.push(rowData);
      });
      data.push(...tableData);
      data.push([]); // 插入空行
    }
  });

  // 将数据添加到工作表
  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

  // 生成 Excel 文件并下载
  XLSX.writeFile(workbook, 'content.xlsx');
};

const openExcel = async (id) => {
  update_messageId.value = id;
  const content = messages.value.find((item) => item.id == id); //拿到当前的内容
  const res = extractEChartsCode(content.content);
  console.log(res, 'res');

  const dataObj = JSON.parse(res);
  ExcelObj.value.push(...dataObj);
  ExcelRef.value.isExcelDrawerVisible = true;
};
// 切换清空
const deleteExcelObj = () => {
  ExcelObj.value = [];
};

/*文档************************************** */

const jsonDocx = ``;

const saveDOCX = async (text) => {
  const html = md.render(text);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'document.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const openDOCX = async (id) => {
  update_messageId.value = id;
  const content = messages.value.find((item) => item.id == id); //拿到当前的内容
  const res = content.content;
  DocxObj.value = res;
  DocxRef.value.isDocxDrawerVisible = true;
  // try {
  //   const html = renderHtml(content.content); // 将 Markdown 转换为 HTML
  //   await navigator.clipboard.write([
  //     new ClipboardItem({
  //       "text/html": new Blob([html], { type: "text/html" }),
  //     }),
  //   ]);
  //   // ElMessage("已复制到剪贴板");
  //   // console.log('HTML 内容:', html); // 打印转换后的 HTML 内容

  //   // 读取剪贴板中的内容
  //   const clipboardItems = await navigator.clipboard.read();
  //   for (const clipboardItem of clipboardItems) {
  //     for (const type of clipboardItem.types) {
  //       if (type === 'text/html') {
  //         const blob = await clipboardItem.getType(type);
  //         const clipboardHtml = await blob.text();
  //         console.log('剪贴板中的 HTML:', clipboardHtml);

  //       }
  //     }
  //   }
  // } catch (error) {
  //   console.error("复制失败:", error);
  // }
  // console.log(content.content, 'content.content');
  // const html = copyHtmls(content.content);
  // console.log(html, 'html');
  // console.log(DocxObj.value,'DocxObj.value');
};
/*新思维导图************************************************************************************** */
const MarkmapLibRef = ref(null);
const MarkmapLibObj = ref(``);

const changeMarkmapLib = async (id) => {
  try {
    messageLoading.value = true;
    const res = await api.post("/llm/generate/", {
      message_id: id,
      room_id: activeRoom.value,
      generate_type: "MarkmapLib",
    });
    messages.value.push(res.data);
    messageLoading.value = false;
    // 滚动到底部
    scrollToBottom();
  } catch (error) {
    ElMessage({
      showClose: true,
      message: error.response.data.message,
      type: "warning",
      duration: 0,
    });
    messageLoading.value = false;
  }
};

const openMarkmapLib = (id) => {
  update_messageId.value = id;
  console.log(update_messageId.value, "update_messageId.value");
  const content = messages.value.find((item) => item.id == id); //拿到当前的内容
  MarkmapLibObj.value = extractMarkdownCode(content.content); //更新内容
  // console.log(MarkmapLibObj.value, "MarkmapLibObj.value");
  MarkmapLibRef.value.opneMarkmapLibDrawer(); //打开
};

//重置按钮
// update_messageId.value
const resetChart = async () => {
  try {
    messageLoading.value = true;
    const res = await api.post("/llm/generate/", {
      update_message_id: update_messageId.value,
    });
    if (res.status === 201) {
      // update_messageId.value 有id
      const index = messages.value.findIndex(
        (item) => item.id === update_messageId.value
      );
      console.log(index, "index");
      if (index !== -1) {
        // 替换对象
        messages.value[index] = res.data;
      }
      // 找到对应的对象 res
      // 将res.data对象全部替换 对象保存在messages.value里面
      console.log(messages.value, "messages.value>>>>>>>.");
      messageLoading.value = false;
      ElMessage.success("已重试");
    }
    console.log(res.data, "res.data");
  } catch (error) {
    ElMessage({
      showClose: true,
      message: error.response.data.message,
      type: "warning",
      duration: 0,
    });
    console.log(error);
    messageLoading.value = false;
  }
};

const changePromptTemplate = () => {
  mitt.emit("openPromptTemplate");
};

const selectAgent = ref("模型选择");
const AgentOptions = [
  {
    value: "模型选择",
    label: "模型选择",
  },
  {
    value: "智能体",
    label: "智能体",
  },
];
const currentSendMessage = computed(() => {
  return selectAgent.value === "模型选择" ? sendMessage : agent_sendMessage;
});


const mdRenderType = ref(1)


const scrollbarRef = ref(null);
const handleWheel = (event) => {
  const scrollContainer = scrollbarRef.value?.$el?.querySelector(
    ".el-scrollbar__wrap"
  );
  const scrollAmount = event.deltaY * 2;
  scrollContainer?.scrollTo({
    left: scrollContainer.scrollLeft + scrollAmount,
    behavior: "smooth",
  });
  event.preventDefault();
};
</script>

<style scoped>
.error-text {
  background: #fdecec;
  border: 1px solid #f15656;
  border-radius: 10px;
  padding: 30px;
  max-width: 80%;
}

.chat-layout {
  display: flex;
  /* height: 90%; */
  width: 100%;
  min-height: 800px;
}

.room {
  margin-right: 5px;
}

.initial-card {
  margin-bottom: 18px;
}

.chat-box {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 400px;
  max-height: calc(100vh - 70px);
  /* min-width: 900px; */
  border: 1px solid #ccc;
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(to top,
      rgba(0, 0, 0, 0),
      rgba(173, 222, 255, 0.5));
  /* height: 30px; */
  padding: 10px;
}

.message-list {
  position: relative;
  flex: 1;
  padding: 10px;
  overflow-y: auto;
  overflow-x: clip;
}

.disabled {
  pointer-events: none;
  opacity: 0.5;
  /* 可选，设置透明度以表示禁用状态 */
}

.message {
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 10px;
  display: block;
  max-width: 80%;
}

.my-message {
  background-color: #e6f7ff;
  /* text-align: right; */
  margin-left: auto;
  padding-left: 20px;
  width: fit-content;
}

.other-message {
  background-color: #f0f0f0;
  width: fit-content;
  padding-left: 20px;
}

.message-content {
  font-size: 14px;
  /* display: inline-flex; */
  max-width: auto;
  /* word-wrap: break-word; */
  /* word-break: break-all; */
  /* white-space: pre-wrap; */
}

.message-username {
  font-size: 12px;
  color: #999;
  margin-right: 5px;
}

.message-info {
  /* display: flex; */
  align-items: center;
  margin-top: 5px;
}

.message-time {
  font-size: 12px;
  color: #999;
}

.message-model {
  font-size: 10px;
  color: #999;
  margin-right: 5px;
}

.message-token-usage {
  font-size: 10px;
  color: #999;
  margin-right: 5px;
}

.message-stop-reason {
  font-size: 10px;
  color: #999;
  margin-right: 5px;
}

.message-actions {
  align-items: center;
  margin-right: 5px;
}

.message-actions .el-button {
  background-color: transparent;
  border: transparent;
  padding: 5px;
}

.message-actions .el-button:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  background-color: #f5f5f5;
}

.chat-affix {
  position: absolute;
  right: 20px;
}

.chat-toolbar {
  display: inline-flex;
  padding-left: 10px;
  height: 45px;
  /* min-width: 900px; */
  background: linear-gradient(to bottom,
      rgba(0, 0, 0, 0),
      rgba(173, 222, 255, 0.5));
  font-size: 14px;
  color: #999;
  overflow-x: auto;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}

.chat-toolbar>* {
  padding: 5px;
  height: fit-content;
}

.chat-toolbar-upload {
  display: flex;
}

.input-box {
  align-items: center;
  padding: 10px;
  background-color: #f5f5f5;
  border-top: 1px solid #ccc;
}

.input-box-header {
  display: flex;
  align-items: center;
  width: 100%;
}

.input-box-footer {
  display: flex;
  align-items: center;
  margin-top: 5px;
  margin-left: 5px;
  width: 100%;
}

.tag-btn{
  margin-right: 12px;
  cursor: pointer;
}

.tag-btn-icon{
  font-size: 14px;
  margin-right: 5px
}

.el-input {
  flex: 1;
  margin-right: 10px;
  resize: vertical;
  overflow: auto;
}

.input-box-button {
  display: flex;
  flex-direction: column;
}

.sendbtn {
  margin-left: 10px;
  margin-bottom: 5px;
}

.Error-Content {
  border-radius: 10px;
  background: #fdecec;
  border: 1px solid #f15656;
  border-radius: 10px;
  padding: 30px;
  max-width: 30%;
}

.UploadFileInfo-Header {
  display: flex;
  flex-direction: row;
  position: relative;
}

.UploadFileInfo {
  width: 214px;
  height: 52px;
  margin: 5px 5px 5px 5px;
  display: flex;
  flex-direction: row;
  align-items: center;
  border-radius: 0.5rem;
  border: 1px solid #d6d5cf;
}

.UploadFileInfoIco {
  width: 46px;
  height: 52px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  background: #207fde;
  border-radius: 5.5px 0px 0px 5.5px;
  margin-right: 10px;
}

.info {
  width: 136px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.FileDelete {
  position: absolute;
}

/* 聊天记录 滚动条 */
.message-list::-webkit-scrollbar {
  width: 6px;
}

.message-list::-webkit-scrollbar-thumb {
  background-color: #dddee0;
  border-radius: 10px;
}

.message-list::-webkit-scrollbar-track {
  background-color: #ffffff;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background-color: rgba(42, 43, 44, 0.3);
}

.search-dialog{
  position: fixed;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  background: #f5f5f5;
  border-radius: 12px;
  border: 2px solid #e6e6e6;
  width: 20vw;
  min-height: 40vh;
  min-height: 0;
  /* overflow: auto; */
  z-index: 2000;
  display: flex;
  flex-direction: column;
  padding: 12px;
}
.search-dialog-header{
  margin-bottom: 12px;
  padding-left: 12px;
  border-left: 4px solid #207fde;
}

:deep(.hljs-punctuation) {
  color: #d4cbcbaa !important;
}

:deep(pre.hljs) {
  color: #a9b7c6 !important;
  background: #282b2e !important;
}

:deep(.hljs-title) {
  color: #ffc66d !important;
  font-weight: bold !important;
}

:deep(.hljs-name) {
  color: #e8bf6a !important;
}

:deep(.hljs-tag) {
  color: #d2cdcdaa !important;
}

:deep(.hljs-attr) {
  color: #a7a1a1 !important;
}

:deep(.hljs-string) {
  color: #d86363 !important;
}

:deep(.code-block pre.hljs ol li .line-num) {
  padding-left: 1.5em !important;
}


/* /deep/ .hljs-title {
  color: #ffc66d !important;
  font-weight: bold !important; 
} */

/* :deep(pre.hljs){
  color: #a9b7c6 !important;
  background: #282b2e !important;
}; */

/* :deep(.hljs-title){
  color: #ffc66d !important;
  font-weight: bold !important; 
}; */

/* :deep(.hljs-name){
  color: #e8bf6a !important;
};
:deep(.hljs-tag){
  color: #d2cdcdaa !important;

};
:deep(.hljs-attr){
  color: #a7a1a1 !important;
};
:deep(.hljs-string){
  color: #d86363 !important;
}; */

/* 滚动条 */
:deep(.code-block pre.hljs) {
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

:deep(.code-block pre.hljs::-webkit-scrollbar) {
  width: 6px;
  height: 8px;
}

:deep(.code-block pre.hljs::-webkit-scrollbar-thumb) {
  background-color: #dddee0;
  border-radius: 10px;
  transition: background-color 0.3s;
  cursor: pointer;
}

:deep(.code-block pre.hljs::-webkit-scrollbar-track) {
  background-color: #ffffff;
}

:deep(.code-block pre.hljs::-webkit-scrollbar-thumb:hover) {
  background-color: rgba(81, 82, 82, 0.3);
}

.diagramButton {
  display: flex;
  justify-content: flex-start;
  width: 367px;
  height: 50px;
  margin-left: -4px;
  border: none;
  background: #f0f0f0;
  color: #333;
}

.diagramButton:hover {
  background: #f0f0f0;
  color: #333;
}

:deep(.el-tabs--border-card > .el-tabs__content) {
  padding: 0px;
}

.divDom {
  transition: background-color 0.3s ease;
  cursor: pointer;
}

.divDom:hover {
  background-color: #f5f7fa;
  /* 鼠标悬停时的背景颜色 */
}

.divDom.active {
  background-color: #cde5ff;
  color: #419eff;
  /* 选中时的背景颜色 */
}

.modelDetails {
  width: 220px;
  height: 261px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  background: #f5f7fa;
  padding: 0px 24px;
  position: relative;
}

.model_title {
  position: absolute;
  top: 4px;
  /* left: 0px; */
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

/* {

} */
:deep(.llmModel_button > span) {
  height: 18px;
  width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline;
}

.features_content {
  color: #419eff;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  /* width: 220px; */
}

.networking {
  width: 81px;
  height: 30px;
  background: #ecf5ff;
  /* margin-left: 5px; */
  border-radius: 4px;
  border: 1px solid #a0cfff;
  color: #409eff;
  display: flex;
  align-items: center;
}

.Advanced_button {
  width: 340px;
  height: 40px;
  display: flex;
  align-items: center;
  padding: 5px 12px;
  cursor: pointer;
}

:deep(.code-block .header .button-group .run-btn) {
  background-color: #696969;
  font-family: "Consolas", "Courier New", monospace;
  margin-right: 5px;
  border-radius: 5px;
  color: #d2e7ff;
  height: 22px;
  transition: color 0.3s ease;
  cursor: pointer;
}

:deep(.code-block .header .button-group .bash-btn) {
  background-color: #696969;
  font-family: "Consolas", "Courier New", monospace;
  margin-right: 5px;
  border-radius: 5px;
  color: #d2e7ff;
  height: 22px;
  transition: color 0.3s ease;
  cursor: pointer;
}

:deep(.code-block .header .button-group .sh-btn) {
  background-color: #696969;
  font-family: "Consolas", "Courier New", monospace;
  margin-right: 5px;
  border-radius: 5px;
  color: #d2e7ff;
  height: 22px;
  transition: color 0.3s ease;
  cursor: pointer;
}

.Networking_StepBar {
  background-color: #f0f0f0;
  padding-left: 20px;
  max-width: 47.6%;
  border-radius: 10px;
  margin-bottom: 10px;
  padding: 10px;
}

/* .loading-spinner {
  background-image: url(../assets/tiao.gif);
  background-size: 100% 100%;
  width: 65px;
  height: 55px;
} */

:deep(.el-collapse-item__header) {
  height: 40px;
  border-radius: 10px 10px 0px 0px;
  padding-left: 10px;
  /* background: linear-gradient(to right, #409eff 1%, #ffffff 1%); */
}

:deep(.el-collapse-item__wrap) {
  padding-left: 10px;
  padding-right: 10px;
  /* background: linear-gradient(to right, #409eff 1%, #ffffff 1%); */
  border-radius: 0px 0px 10px 10px;
}

/* /deep/ .message-content table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
}

/deep/.message-content th {
  border: 1px solid #ccc !important;
  padding: 8px;
  text-align: center;
}

/deep/.message-content td {
  border: 1px solid #ccc !important;
  padding: 8px;
  text-align: center;
}

/deep/.message-content tr:nth-child(even) {
  background-color: #f2f2f2;
}

/deep/.message-content tr:nth-child(odd) {
  background-color: #ffffff;
} */

:deep(.message-content table) {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
}

:deep(.message-content th) {
  border: 1px solid #ccc !important;
  padding: 8px;
  text-align: center;
}

:deep(.message-content td) {
  border: 1px solid #ccc !important;
  padding: 8px;
  text-align: center;
}

:deep(.message-content tr:nth-child(even)) {
  background-color: #f2f2f2;
}

:deep(.message-content tr:nth-child(odd)) {
  background-color: #ffffff;
}

.dispose {
  background-image: url(../assets/dispose.gif);
  background-size: 100% 100%;
  width: 110px;
  height: 14px;
}

.search {
  background-image: url(../assets/search.gif);
  background-size: 100% 100%;
  width: 96px;
  height: 14px;
}

.Identify_picture {
  background-image: url(../assets/Identify_picture.gif);
  background-size: 100% 100%;
  width: 110px;
  height: 14px;
}

.Generate_picture {
  background-image: url(../assets/Generate_picture.gif);
  background-size: 100% 100%;
  width: 110px;
  height: 14px;
}

.Generate_chart {
  background-image: url(../assets/Generate_chart.gif);
  background-size: 100% 100%;
  width: 110px;
  height: 14px;
}


:deep(.katex-html) {
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
}

.container {
  width: 100%;
  height: 50px;
  display: flex;
  align-items: center;
  padding: 5px;
  /* position: relative; */
  cursor: pointer;
}

.video-info {
  width: 190px;
  height: 41px;
  border: 1px solid #c1c1c1;
  display: flex;
  align-items: center;
  border-radius: 5px;
  margin-right: 5px;
}

.avatar-container {
  width: 45px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar {
  width: 32px;
  height: 32px;
}

.video-details {
  display: flex;
  flex-direction: column;
  margin-left: 5px;
  width: 120px;
}

.video-name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline;
}

.video-size {
  font-size: 12px;
  color: #c1c1c1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline;
}

.close_video {
  /* position: absolute;
  right: 0px;
  top: 0px;
  left: 0px;
  top: 0px; */
}
:deep(.think-value) {
  font-size: 13px;
  color: #636363;
  background: #fff;
  border-radius: 5px;
  padding: 15px;
  display: inline-block;
  margin-top: 10px;
  border: 1px solid #409eff;
}
:deep(.open-think) {
  cursor: pointer;
  font-weight: 600;
  color: #409eff;
  margin-top: 15px;
  display: flex;
  align-items: center;
}
.open-think-icon{
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid #409eff;
  border-right: 5px solid transparent;
  
  /* width: 10px;
  height: 10px;
  background-color: #409eff;
  clip-path: polygon(0 0, 80% 50%, 0 100%, 0 0);
  margin-right: 2px; */
}
</style>
