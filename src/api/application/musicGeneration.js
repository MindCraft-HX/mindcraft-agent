import api from "@/utils/request";

/** 音乐合成 创建任务(api)
 *  /v1/music_generations/artistic/
 */

export const postMusicGenerations = (data) => {
  return api.post("/v1/music_generations/artistic/", data);
};

/** /v1/agent/prompt_generator_v1/
 *  ai帮我想
 */
export const postMusicGenerator = (data) => {
  return api.post("/v1/agent/prompt_generator_v1/", data);
};

/** 音频拆分(不入库,只返回ID)
 * /v1/music_generations/music_upload/
 */

export const postMusicUpload = (data) => {
  return api.post("/v1/music_generations/music_upload/", data);
};

/** 音色+伴奏入库
 * /v1/music_generations/voice_instrumental/
 */
// export const postVoiceInstrumental = (data) => {
//   return api.post("/v1/music_generations/voice_instrumental/", data);
// };

/** 音色+伴奏修改
 * /v1/music_generations/voice_instrumental/25/
 */

export const putVoiceInstrumental = (id, data) => {
  return api.post(`/v1/music_generations/voice_instrumental/${id}/`, data);
};

/** 干唱+伴奏生成(不入库)
 * /v1/music_generations/generation_mp3/
 */
export const postGenerationMp3 = (data) => {
  return api.post("/v1/music_generations/generation_mp3/", data);
};

/** 音色+伴奏 列表
 * /v1/music_generations/voice_instrumental/
 */

export const getVoiceInstrumental = (
  gen_category,
  gen_share,
  size,
  page,
  gen_name
) => {
  return api.get("/v1/music_generations/voice_instrumental/", {
    params: {
      gen_category,
      gen_share,
      size,
      page,
      gen_name,
    },
  });
};

/** 获取列表(入库音乐)
 * /v1/music_generations/
 */

export const getMusicGenerations = (size, page) => {
  return api.get("/v1/music_generations/artistic/", {
    params: {
      size,
      page,
    },
  });
};

/** 专辑 修改
 * /v1/music_generations/artistic/44/
 */

export const putArtistic = (id, data) => {
  return api.post(`/v1/music_generations/artistic/${id}/`, data);
};

/** 专辑 删除
 * /v1/music_generations/artistic/39/del/
 */

export const delArtistic = (id) => {
  return api.post(`/v1/music_generations/artistic/${id}/del/`);
};

/** 伴奏音色 删除
 * /v1/music_generations/voice_instrumental/43/del/
 */

export const delVoiceInstrumental = (id) => {
  return api.post(`/v1/music_generations/voice_instrumental/${id}/del/`);
};

/** 伴奏音色 修改
 * /v1/music_generations/voice_instrumental/25/
 */
export const putMusicVoiceInstrumental = (data) => {
  return api.post(`/v1/music_generations/voice_instrumental/followed/`, data);
};

/** 伴奏音色 修改
 * /v1/music_generations/voice_instrumental/25/
 */
export const putMyMusicVoiceInstrumental = (id,data) => {
  return api.post(`/v1/music_generations/voice_instrumental/${id}/`, data);
};

/** 音色+伴奏 列表
 * /v1/music_generations/voice_instrumental/
 */

export const getVoiceInstrumentalList = (
  gen_category,
  size,
  page,
  gen_followed
) => {
  return api.get("/v1/music_generations/voice_instrumental/", {
    params: {
      gen_category,
      size,
      page,
      gen_followed,
    },
  });
};

/** 用户 查询可用ID
 *  /v1/music_generations/voice_instrumental/select/
 */

export const getVoiceInstrumentalSelect = (gen_category) => {
  return api.get("/v1/music_generations/voice_instrumental/select/", {
    params: {
      gen_category,
    },
  });
};

/** 伴奏音色 添加至用户
 * /v1/music_generations/voice_instrumental/followed/
 */

export const getVoiceInstrumentalFollowed = (body) => {
  return api.post("/v1/music_generations/voice_instrumental/followed/", body);
};


/** 伴奏音色 拆分入库
 * /v1/music_generations/voice_instrumental/music_upload/
 */

export const postVoiceInstrumentalMusicUpload = (body) => {
  return api.post("/v1/music_generations/voice_instrumental/music_upload/", body);
}

/** 伴奏音色 修改
 * /v1/music_generations/voice_instrumental/25/
 */
export const postVoiceInstrumental = (id, body) => {
  return api.post(`/v1/music_generations/voice_instrumental/${id}/`, body);
}