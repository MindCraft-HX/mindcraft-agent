import api from "@/utils/request";

// 获取预设指令的信息 列表
export const getInstructionPrompt = (size, page, prompt_name, ordering, sort) => {
  return api.get(
    `llm/get_instruction_prompt_list/?size=${size}&page=${page}&prompt_name=${prompt_name}&ordering=${!sort ? '-' : ''}${ordering}`
  );
};
//获取用户信息
export const getUserProfile = () => {
  return api.get(`/llm/get_user_profile/`);
};

//获取预设指令列表 我的
export const myInstructionPromptList = () => {
  return api.get(`/llm/get_instruction_prompt_list_by_user/`);
};
//关注或者取消关注
export const postFollowInstruction = (id) => {
  return api.post(`/llm/follow_instruction_prompt/${id}/`);
};
//预设指令列表 创建
export const addInstructionPromptList = (data) => {
  return api.post(`llm/create_instruction_prompt/`, data);
};
//预设指令列表 修改
export const modifyInstructionPromptList = (id, data) => {
  return api.post(`llm/modify_instruction_prompt/${id}/`, data);
};
//预设指令列表 删除
export const removeInstructionPromptList = (id) => {
  return api.delete(`llm/delete_instruction_prompt/${id}/`);
};

/** 获取分类接口
 * /llm/instruction_prompt/value_map/
 */
export const getInstructionPromptValueMap = () => {
  return api.get(`/llm/instruction_prompt/value_map/`);
};

/** 创捷接接口
 * /llm/create_instruction_prompt/
 */
export const AddCreateInstructionPrompt = (data) => {
  return api.post(`/llm/create_instruction_prompt/`, data);
};
/** 创建 和 关注
 * /llm/instruction_prompt/list/
 */
export const AddCreateInstructionPromptList = (
  size,
  page,
  prompt_name,
  ordering,
  list_type,
  sort
) => {
  return api.get(
    `/llm/instruction_prompt/list/?size=${size}&page=${page}&prompt_name=${prompt_name}&ordering=${!sort ? '-' : ''}${ordering}&list_type=${list_type}`
  );
};

/** 修改
 * /llm/modify_instruction_prompt/117/
 */
export const modifyInstructionPrompt = (id, data) => {
  return api.post(`/llm/modify_instruction_prompt/${id}/`, data);
};
