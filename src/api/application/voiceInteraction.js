import api from "@/utils/request";
import { serializeObject } from '@/utils/util'

/** 用户角色档案 列表
 * /v1/character/
 */
export const apiUserCharacter = (data) => {
  if (data?.data_type) {
    return api.get("/v1/user/character/?data_type=" + data.data_type);
  } else {
    return api.get("/v1/user/character/");
  }

}

/** 获取历史记录
 * /v1/character/
 */
export const apiUserCharacterHistory = (character_id, obj) => {
  let params = serializeObject(obj)

  return api.get(`/v1/character/${character_id}/history/?` + params);
}

/** 清除历史记录
 * /v1/character/
 */
export const apiClearUserCharacterHistory = (character_id) => {
  return api.post(`/v1/character/${character_id}/history/clear/`);
}
/**
 * 获取llm模型
 * 
*/
export const apiGetAgent = () => {
  return api.get(`/v1/character/agents/`);
}

/***
 * 关注人设
 * **/
export const apiFollowCharacter = (id,params) => {
  return api.post(`/v1/user/character/${id}/follow/`,params);
}

/**
 * 获取模型选择和语种
 * 
*/
export const apiSelctOptions = () => {
  return api.get(`/v1/character/config/`);
}
