import api from "@/utils/request";

/** 分享积分
 *  {{host}}/share/object/
 */

export const postSharePoints = (data) => {
  return api.post("/share/object/", data);
};


/** 获取分享积分
 *  {{host}}/share/object/
 */

export const getSharePoints = (data) => {
    return api.get("/share/object/", data);
}