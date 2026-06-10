 // 导入mockjs 返回一个对象
import Mock from 'mockjs';

 
// 使用setup配置请求的响应时间，单位是毫秒
Mock.setup({
  // timeout: 1000 // 意味着接口1s后返回
  timeout: '200-1000' // 意味这接口响应时间介于200毫秒-1s之间
})


// 用户中心模拟数据
const userData = {
    id: Mock.Random.guid(),
    name: Mock.Random.cname(),
    email: Mock.Random.email(),
    username: Mock.Random.word(),
    avatar: Mock.Random.image('100x100', '#4A7BF7', '#fff', 'png', 'Mock Avatar'),
  };
  
  // 模拟 GET 请求的接口
  Mock.mock('/api/userCenter', 'get', userData);
  
  // 模拟修改用户信息的接口
  Mock.mock('/api/updateUser', 'post', (options) => {
    const updatedData = JSON.parse(options.body);
    
    // 更新模拟的用户数据
    Object.assign(userData, updatedData);
  
    return {
      code: 200,
      message: '用户信息更新成功',
      data: userData,
    };
  });


  // echarts模拟数据
  Mock.mock('/api/getChartData', {
    'GPT-3.5-Turbo|7': [() => Mock.Random.integer(1000, 10000)],
    'GPT-4-Turbo|7': [() => Mock.Random.integer(1000, 10000)],
    'DALL-E-3|7': [() => Mock.Random.integer(1000, 10000)],
    'GPT-4-V|7': [() => Mock.Random.integer(1000, 10000)],
    'date|7': [
      () => Mock.Random.date('MM-dd'), // Generate the latest 7 days' dates
    ]
  });

  //积分明细
  Mock.mock('/api/getData', {
    'list|8': [{
      'date|+1': [
        '2024-01-31 10:00:00',
        '2024-01-30 10:00:00',
        '2024-01-29 10:00:00',
        '2024-01-28 10:00:00',
        '2024-01-27 10:00:00',
        '2024-01-26 10:00:00',
        '2024-01-25 10:00:00',
      ],
      'name|1': ['@pick(["主账户", "子账户"])'],
      'state|1': ['@pick(["支出", "转入", "转出", "冻结"])'],
      'city|1': ['Los Angeles'],
      'address|1': ['@pick(["DALL-E-3", "GPT-4-V","GPT-3.5-Turbo","GPT-4-Turbo"])'],
      'zip|1': ['CA 90036'],
    }]
  });