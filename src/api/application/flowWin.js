import api from "@/utils/request";


/** 划词翻译智能体
 * /v1/agent/spotup_window/
 */

export const apiAgentSpotupWindow = (data) => {
  return api.post("/v1/agent/spotup_window/", data);
}


/** 获取翻译语种
 * /v1/data/spotup_window_language/
 */

export const apiSpotupWindowLanguage = () => {
  return api.post("/v1/data/spotup_window_language/");
}

/** 创建房间
 * /llm/add_room/
 */

export const addRoom = (data) => {
  return api.post("/llm/add_room/", data);
}