/**
 * 序列化对象
 * */ 
export function serializeObject(obj) {
  return Object.entries(obj)
    .filter(([key, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}
