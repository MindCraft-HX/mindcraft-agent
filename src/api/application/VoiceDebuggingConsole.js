import api from "@/utils/request";

/** 语音识别数据(模型 音色)
 *  {{host}}/llm/tts/config/
 */
export const getVoiceConfig = () => {
  return api.get("/llm/tts/config/");
};

/** 语音生成(返回wav)
 *  {{host}}/llm/tts/
 */

export const getVoiceTts = (data) => {
  return api.post("/llm/tts/", data);
};

/** TTS 模型列表+参数
 * /api/v1/tts/
 */

export const getTTsList = () => {
  return api.get("/v1/tts/");
};

/** TTS 语音合成
 * /api/v1/tts/
 */
export const postUpLoadingTTs = (data) => {
  return api.post("/v1/tts/", data);
};

/** ASR 模型列表+参数
 * /api/v1/asr/
 */
export const getAsrList = () => {
  return api.get("/v1/asr/");
};

/** ASR 语音识别
 * /api/v1/asr/
 */
export const postAsr = (data) => {
  return api.post("/v1/asr/", data);
};

/** 文件上传
 * /v1/voice/file/
 */
export const postVoiceFile = (data) => {
  return api.post("/v1/voice/file/", data);
};

/** 音色克隆试听
 * /v1/voice/clone/
 */
export const postVoiceClone = (data) => {
  return api.post("/v1/voice/clone/", data);
};

/** 音色克隆保存入库
 * /v1/voice/save/
 */
export const postVoiceSave = (data) => {
  return api.post("/v1/voice/save/", data);
};


/** ASR task数据获取
 * /v1/asr/task/f9b28ee1-6a12-4e95-acd3-471ad5d38828/
 */

export const getAsrTask = (taskId) => {
  return api.get(`/v1/asr/task/${taskId}/`);
};

/** ASR 语音识别示例文件
 * /api/v1/asr/file/
 */
export const getAsrFile = () => {
  return api.get("/v1/asr/file/");
};

/** TTV 模型列表+参数
 * /api/v1/ttv/
 */

export const getTtvList = () => {
  return api.get("/v1/ttv/");
};

/** TTV 视频合成
 * /api/v1/ttv/
 */

export const postTtv = (data) => {
  return api.post("/v1/ttv/", data);
};

/** TTV 任务取消
 * /v1/ttv/task/{taskId}/cancel
 */
export const cancelTtvTask = (taskId) => {
  return api.post(`/v1/ttv/task/${taskId}/cancel/`);
};

/** ttv 示例文案
 *  /v1/data/static/ttv_title/
 */

export const getTtvTitle = () => {
  return api.get("/v1/data/static/ttv_title/", {
    params: {
      category: 1,
    },
  });
};

export const getTtvDescribe = () => {
  return api.get("/v1/data/static/ttv_title/", {
    params: {
      category: 2,
    },
  });
};

/** /v1/tti/
 * 文生图
 */
export const getTtiList = () => {
  return api.get("/v1/tti/");
};

export const postTti = (data) => {
  return api.post("/v1/tti/", data);
};

/** /v1/agent/prompt_generator_v1/
 *  ai帮我想
 */
export const postPromptGenerator = (data) => {
  return api.post("/v1/agent/prompt_generator_v1/", data);
};
