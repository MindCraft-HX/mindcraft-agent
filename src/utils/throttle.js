// throttle.js
export function throttle(func, delay) {
    let timeout;
    let lastArgs;
    let lastThis;
  
    return function() {
      const context = this;
      const args = arguments;
  
      if (!timeout) {
        lastArgs = args;
        lastThis = context;
        timeout = setTimeout(() => {
          timeout = null;
          func.apply(lastThis, lastArgs);
        }, delay);
      }
    };
  }