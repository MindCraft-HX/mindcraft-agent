import api from "@/utils/request";

/** 积分消耗详情
 * /v1/data/model_consume/
 */

export const getStowageConsume = () => {
  return api.get("/v1/data/model_consume/");
};
