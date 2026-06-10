import { characterSquare } from './characterSquare.js'
import { voiceInteraction } from './voiceInteraction.js';
import GTWebSocket from "./base/websocket.js"
/**
 * 一条消息解析中，可能会包含以下参数
 * socketName：消息名称
 * formatData：发送前的格式化处理
 * processor：必须，接收后消息的处理函数
 */
const parseMessage = [
  ...characterSquare,
  ...voiceInteraction
]

const character_ws = new GTWebSocket({parseMessage: characterSquare});
const multi_model_ws = new GTWebSocket({parseMessage: voiceInteraction});

export  {
  character_ws,
  multi_model_ws
}