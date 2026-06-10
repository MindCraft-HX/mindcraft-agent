import api from "@/utils/request";


/** 创建订单
 * /llm/recharge_points/
 * order_price   最小 0.01
 * order_points  分数
 * order_type    类型WeChatPay|AliPay
 */

export const getRechargePoints = (data)=>{
    return api.post('/llm/recharge_points/',data)
};

/** 支付有没有成功
 * llm/recharge_points/1
 * id
 */

export const getWhetherPayment = (id)=>{
    return api.get(`/llm/recharge_points/${id}`)
}