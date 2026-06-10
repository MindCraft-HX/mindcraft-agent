import api from "@/utils/request";


/** 积分充值List
 * 
 */
export const getPricingRecord = ()=>{
    return api.get("/llm/pricing_record/");
};