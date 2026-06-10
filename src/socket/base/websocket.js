import { ElMessage } from "element-plus";
import wsResult from "./result";

const NODE_ENV = window.VITE_NODE_ENV || import.meta.env.VITE_NODE_ENV;


const noop = () => { };

class GTWebSocket {
  constructor(options) {
    const { parseMessage } = options;
    this.token = "";
    this.ws = null;
    // 接口列表
    this.parseMessage = parseMessage.reduce((obj, item) => {
      obj.set(item.socketName, item);
      return obj
    }, new Map());
    // 连接状态 0:未连接 1:连接中 2:已连接
    this.wsState = 0;
    // 重连次数
    this.reconnectCount = 0;
    // 重连频率
    this.reconnectTime = 1000;
    // 重连定时器
    this.reconnectTimer = null;
    // 是否在处理数据流
    this.messageState = 0;
    // 接收到的iq数据流
    this.receiveStream = [];
    // 心跳机制 (服务端说由于单片机容易丢包，所以就不发心跳包了一直连着，先放在这里他们扛不住了要改再说)
    this.pingTimer = null;
  }
  // 连接
  connect(token) {
    this.token = token;
    if(!this.token) {
      console.warn('未获取到登录信息');
      return;
    }

    try {
      if(this.wsState != 0) {
        throw '当前连接状态异常'
      }
      let wsURL = 'wss://api.mindcraft.com.cn/socket-v1/'; 
      if(NODE_ENV === 'development' || NODE_ENV === 'testing'){
        wsURL = localStorage.getItem("wsURL") || 'wss://grayapi.mindcraft.com.cn/socket-v1/';
      }
      // 创建WebSocket连接
      this.ws = new WebSocket(wsURL + `?token=${this.token}`)
      // 设置WebSocket连接状态为1
      this.wsState = 1;
      // 绑定WebSocket连接成功事件
      this.ws.onopen = this.openSucc.bind(this);
      this.ws.onmessage = this.receiveMessage.bind(this);
      this.ws.onclose = this.reconnect.bind(this);
      // 绑定WebSocket连接关闭事件
      this.ws.onerror = () => {
      // 绑定WebSocket连接错误事件
        console.log('websocket 连接发生了错误, 网络情况：' + navigator.onLine);
      }
    } catch (error) {
      this.reconnect()
      // 如果发生错误，则重新连接
    }
  }
  // 重连
  reconnect() {
    this.wsState = 0;
    console.warn('ws连接关闭，正在尝试重连');
    // 暂停心跳检测
    clearTimeout(this.pingTimer);
    if (this.reconnectCount < 30) {
      this.reconnectTimer = setTimeout(() => {
        console.warn(`ws重连中，第${this.reconnectCount}次尝试`);
        this.connect(this.token);
      }, this.reconnectTime);
      this.reconnectCount++;
      if (this.reconnectTime < 5000) {
        this.reconnectTime += 500;
      }
    } else {
      ElMessage.error('当前网络不佳')
    }
  }
  // 开启成功 
  openSucc() {
    this.wsState = 2;
    this.resetConnect()
  }
  // 重置状态
  resetConnect() {
    this.reconnectCount = 0;
    this.reconnectTime = 1000;
    clearTimeout(this.reconnectTimer);
  }
  // 发送消息
  sendMessage(name, data = {}) {
    if(Object.prototype.toString.call(data) !== '[object Object]') {
      console.error('发送消息格式错误')
      return
    }
    if(data.hasOwnProperty('sendOriginalData')) {
      console.error('发送消息含有保留字段')
      return
    }
    if (this.wsState == 2) {
      if(this.parseMessage.has(name)) {
        const orginData = { socket_id: name, ...data }
        const message = this.parseMessage.get(name)?.formatData(orginData) || orginData
        if(message.sendOriginalData) {
          if(message?.DATA) {
            this.ws.send(message.DATA)
          } else {
            console.error('发送原始数据请将数据放入DATA字段')
          }
        } else {
          this.ws.send(JSON.stringify(message))
        }
      } else {
        console.error(`不存在【${name}】消息，请检查或新建一个`)
      }
    }
  }
  // 接收消息
  receiveMessage(res) {
    if(res.data) {
      try {
        const message = JSON.parse(res.data)
        this.receiveStream.push(message)
      } catch (error) {
        console.error('消息解析失败', error)
      }
    }
    this.disposeMessage()
  }
  // 处理消息
  async disposeMessage() {
    if(this.receiveStream.length && this.messageState == 0) {
      this.messageState = 1
      const item = this.receiveStream.shift()
      const { socket_id = null , socket_status } = item
      if(socket_status) {
        const result = await wsResult(item)
        if(!result) {
          if(!socket_id) {
            console.warn('返回错误消息，已跳过执行', item)
            this.messageState = 0
            this.disposeMessage()
            return
          }
        }
      }
      if(socket_id) {
        try {
          await this.parseMessage.get(socket_id).processor(item, this)
        } catch (error) {
          console.error(`找不到【${socket_id}】的消息处理器`, error)
        } finally {
          this.messageState = 0
          this.disposeMessage()
        }
      } else {
        console.warn("当前消息无需处理，已跳过执行", item)
        this.messageState = 0
        this.disposeMessage()
      }
    }
  }
  // 断连
  disconnect () {
    try {
      console.log('断开连接')
      clearTimeout(this.pingTimer);
      if (this.ws) {
        this.ws.onopen = noop;
        this.ws.onmessage = noop;
        this.ws.onclose = noop;
        this.ws.onerror = noop;
        this.ws.close();
      }
      this.wsState = 0
    } catch (error) {
      console.error('断开连接失败', error)
    }
  }
}
export default GTWebSocket;