import api from "@/utils/request";

/** 创建角色
 * /v1/character/
 */
export const apiCreateCharacter = (params) => {
  return api.post("/v1/character/", params);
}

/** 用户角色档案 创建
 * /v1/user/character/
 */
export const apiCreateUserCharacter = (params) => {
  return api.post("/v1/user/character/", params);
}

/** 更新角色资源
 * /v1/character/{id}/media_update/
 */
export const apiCreateCharacterMedia = (params, id) => {
  return api.post(`/v1/character/${id}/media_update/`, params);
}

/** 更新角色资源
 * /v1/user/character/{id}/media_update/
 */
export const apiCreateUserCharacterMedia = (params, id) => {
  return api.post(`/v1/user/character/${id}/media_update/`, params);
}

/** 更新角色
 * /v1/character/{id}/
 */
export const apiSaveCharacter = (params, id) => {
  return api.post(`/v1/character/${id}/`, params);
}

/** 用户角色档案 更新
 * /v1/user/character/{id}/
 */
export const apiSaveUserCharacter = (params, id) => {
  return api.post(`/v1/user/character/${id}/`, params);
}

/** 关注角色
 * /v1/character/{id}/follow/
 */
export const apiFollowCharacter = (params, id) => {
  return api.post(`/v1/character/${id}/follow/`, params);
}

/** 关注人设
 * /v1/user/character/{id}/follow/
 */
export const apiUserFollowCharacter = (params, id) => {
  return api.post(`/v1/user/character/${id}/follow/`, params);
}

/** 角色列表
 * /v1/character/
 */
export const apiGetCharacterList = (data) => {
  return api.get(`/v1/character/?size=${data.size}&page=${data.page}&data_type=${data.data_type}&ordering=${data.sort}`);
}

/** 角色列表(不分页)
 * /v1/character/
 */
export const apiGetCharacterAllList = () => {
  return api.get(`/v1/character/?data_type=info`);
}

/** 角色详情
 * /v1/character/{id}/
 */
export const apiGetCharacterById = (id) => {
  return api.get(`/v1/character/${id}/`);
}

/** 用户角色档案详情
 * /v1/user/character/{id}/
 */
export const apiGetUserCharacterById = (id) => {
  return api.get(`/v1/user/character/${id}/`);
}


/** 角色字典数据
 * /v1/character/dictionary/
 */
export const apiGetCharacterDict = () => {
  return api.get(`/v1/character/dictionary/`);
}


/** 音色列表数据
 * /v1/voice/list/
 */
export const apiGetVoiceList = (data) => {
  return api.get(`/v1/voice/list/?size=${data.size}&page=${data.page}&ordering=${data.sort}&voice_type=${data.type}`);
}

/** 角色音色生成
 * /v1/character/{id}/voice/
 */
export const apiCreateCharacterVoice = (data, id) => {
  return api.post(`/v1/character/${id}/voice/`, data);
}

/** 角色音色更新

 * /v1/character/{id}/voice/save/
 */
export const apiSaveCharacterVoice = (data, id) => {
  return api.post(`/v1/character/${id}/voice/save/`, data);
}

/** 角色音色更新
 * /v1/character/{id}/copy/
 */
export const apiCopyCharacter = (id) => {
  return api.post(`/v1/character/${id}/copy/`);
}

/** 用户角色档案
 * /v1/character/{id}/copy/
 */
export const apiUserCharactList = (data) => {
  return api.get(`/v1/user/character/?size=${data.size}&page=${data.page}&data_type=${data.data_type}&ordering=${data.sort}`);
}

/** 删除角色
 * /v1/character/{id}/del/
 */
export const apiDeleteCharacter = (id) => {
  return api.post(`/v1/character/${id}/del/`);
}

/** 用户角色档案 删除
 * /v1/user/character/{id}/del/
 */
export const apiDeleteUserCharacter = (id) => {
  return api.post(`/v1/user/character/${id}/del/`);
}

/** 获取角色图片 描述(http)
 * /v1/character/{id}/media_create_appearance/
 */
export const apiCreateCharacterPrompt = (data, id) => {
  return api.post(`/v1/character/${id}/media_create_appearance/`, data);
}

/** 获取人设图片 描述(http)
 * /v1/user/character/{id}/media_create_appearance/
 */
export const apiCreateUserCharacterPrompt = (data, id) => {
  return api.post(`/v1/user/character/${id}/media_create_appearance/`, data);
}

/** 角色台词测试生成
 * /v1/character/{id}/voice_test/
 */
export const apiCharacterVoiceTest = (data, id) => {
  return api.post(`/v1/character/${id}/voice_test/`, data);
}

/** 多角色台词测试生成
 * /v1/character/{id}/update_voice_test/
 */
export const apiCharacterUpdateVoiceTest = (data, id) => {
  return api.post(`/v1/character/${id}/update_voice_test/`, data);
}

/** 图生图 应用端智能体(上传链接+返回链接)
 * /v1/agent/image2image/
 */
export const apiCharacterImg2Img = (data) => {
  return api.post(`/v1/agent/image2image/`, data);
}