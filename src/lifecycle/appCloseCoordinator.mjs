import { createCloseParticipantRegistry } from './closeParticipantRegistry.mjs'

/**
 * Renderer 侧 CloseCoordinator 接线：
 * - 持有 closeParticipantRegistry 单例（document dirty、未来的 Agent/Chat
 *   flush participant 都注册到这里）；
 * - 消费 main 的 CLOSE_COORDINATOR_REQUEST，跑完 registry 后通过
 *   CLOSE_COORDINATOR_RESPONSE 回传聚合结果。
 *
 * main 只认识 ready/cancel/error 聚合，不 import 任何 renderer domain。
 */
export function createAppCloseCoordinator({ api, timeoutMs } = {}) {
  const registry = createCloseParticipantRegistry({ timeoutMs })
  let off = null
  if (api && typeof api.onCloseCoordinatorRequest === 'function' && typeof api.respondCloseCoordinator === 'function') {
    off = api.onCloseCoordinatorRequest(request => {
      Promise.resolve(registry.beforeCloseAll(request))
        .then(result => api.respondCloseCoordinator(result))
        // main 侧有 timeout 兜底，renderer 回传失败不抛。
        .catch(() => {})
    })
  }
  return {
    registry,
    dispose() {
      if (typeof off === 'function') off()
      off = null
    },
  }
}

let singleton = null

/**
 * 主 workbench renderer 的应用级单例。Main.vue setup 顶层调用以保证桥接
 * 在任意路由下都存活；业务模块（mdViewer document dirty participant 等）
 * 通过它拿到 registry 注册 participant。
 */
export function getAppCloseCoordinator() {
  if (!singleton) {
    singleton = createAppCloseCoordinator({
      api: typeof window !== 'undefined' ? window.electronAPI : null,
    })
  }
  return singleton
}
