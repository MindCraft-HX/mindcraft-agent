import { ElMessage, ElMessageBox } from "element-plus"
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();


export default (res) => {
	return !!disposeFun[res.socket_status] ? disposeFun[res.socket_status](res) : disposeFun.other(socket_status)
}

const disposeFun = {
	0: (data) => {
		// 程序错误
		return false
	},

  // 连接状态类型
	1001: (data) => {
		// 连接建立成功
		return true
	},
	1002: (data) => {
		// 智能体回复内容
		return true
	},
	1003: (data) => {
		// 请求成功
		return true
	},
	1004: (data) => {
		// 操作完成
		return true
	},
	1005: (data) => {
		// 停止实时识别成功
		return true
	},
	1006: (data) => {
		// 智能体已停止
		return true
	},
	1007: (data) => {
		// 智能体返回值
		return true
	},
	1008: (data) => {
		// 携带token 建立成功
		return true
	},

  // 认证类型报错
	2001: (data) => {
		// 认证失败
		return false
	},
	2002: (data) => {
		// 认证成功
		return true
	},
	2003: (data) => {
		// 认证请求超时
		return false
	},
	2004: (data) => {
		// 未提供认证信息
		return false
	},

  // 参数错误类型
	3001: (data) => {
  // 参数错误类型
		return false
	},
	3002: (data) => {
		// 余额不足
    ElMessageBox.confirm('积分不足', '提示', {
      confirmButtonText: '去充值',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      mitt.emit("clickDrawer", "pointRecharge")
    })
		return false
	},
	3003: (data) => {
		// 参数 json 化失败
		return false
	},

  // 服务器错误类型
	4001: (data) => {
		// 未知的服务器错误
		return false
	},
	4002: (data) => {
		// 服务暂时不可用
		return false
	},
	4006: (data) => {
		// 智能体已停止
		return false
	},
	4008: (data) => {
		// 智能体已停止
		return false
	},
  // Socket 特殊错误
	5001: (data) => {
		// 连接失败
		return false
	},
	5002: (data) => {
		// 连接超时
		return false
	},
	5003: (data) => {
		// 连接被拒绝
		return false
	},
	5004: (data) => {
		// 断开 socket 连接
		return false
	},

	other: (data) => {
		// 其他情况
		return true
	}
}