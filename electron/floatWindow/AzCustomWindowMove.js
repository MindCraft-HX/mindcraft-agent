const { screen } = require("electron");
/* 自定义窗口移动 */
class AzCustomWindowMove {
  constructor() {
    this.isOpen = false;
    this.win = null;
    this.winStartPosition = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
    this.startPosition = {
      x: 0,
      y: 0,
    }
  }
  init(win) {
    this.win = win;
  }
  start() {
    this.isOpen = true;
    // 获取当前窗口偏移[x, y]
    const winPosition = this.win.getPosition();
    // 获取当前缩放[width, height]
    const winSize = this.win.getSize();
    this.winStartPosition.x = winPosition[0];
    this.winStartPosition.y = winPosition[1];
    this.winStartPosition.width = winSize[0];
    this.winStartPosition.height = winSize[1];

    // 获取鼠标绝对位置
    const mouseStartPosition = screen.getCursorScreenPoint();
    this.startPosition.x = mouseStartPosition.x;
    this.startPosition.y = mouseStartPosition.y;

    // 开启刷新
    this.move();
  }
  move() {
    if (!this.isOpen) {
      return;
    };
    // 如果窗口已销毁
    if (this.win.isDestroyed()) {
      this.end();
      return;
    }
    // 判断窗口是否聚焦
    if (!this.win.isFocused()) {
      this.end();
      return;
    }
    const cursorPosition = screen.getCursorScreenPoint();

    const x = this.winStartPosition.x + cursorPosition.x - this.startPosition.x;
    const y = this.winStartPosition.y + cursorPosition.y - this.startPosition.y;

    // 更新位置的同时设置窗口原大小， windows上设置=>显示设置=>文本缩放 不是100%时，窗口会拖拽放大
    this.win.setBounds({
      x: x,
      y: y,
      width: this.winStartPosition.width,
      height: this.winStartPosition.height,
    })
    setTimeout(() => {
      this.move();
    }, 20)
  }
  end() {
    this.isOpen = false;
  }
}

module.exports = { AzCustomWindowMove };