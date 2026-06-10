import api from "@/utils/request";


/** font-lab登录接口
 * /llm/font_lab/login/
 */

export const loginFontLab = () => {
    return api.post("/llm/font_lab/login/");
}

/**
 * 记录次数
 * **/
export const callRecord = (data) => {
    return api.post("/v1/data/call_record/",data);
}
