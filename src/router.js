import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';

const routes = [
    {
        path: '/',
        redirect: '/main/chat'
    },
    {
        path: '/main',
        name: 'MainLayout',
        component: ()=>import('./Main.vue'),
        meta: { requiresAuth: true },
        children: [
            {
                path: 'chat',
                name: 'Chat',
                component: ()=>import('@/components/Chat.vue'),
            },
            {
                path: 'groupchat',
                name: 'GroupChat',
                component: ()=>import('@/components/GroupChat.vue'),
            },
            {
              path:'/characterSquarePage',
              name:'characterSquarePage',
              component:()=>import('@/views/application/components/characterSquare/index.vue'),
              meta:{parent: '/application'},
            },
            {
              path:'/application',
              name:'Application',
              component:()=>import('@/views/application/index.vue'),
              meta:{requiresAuth: true, parent: '/application'},
              children:[
                { 
                  path:'/approvalForm',
                  name:'ApprovalForm',
                  component:()=>import('@/views/application/components/ApprovalForm.vue')
                },
                {
                  path:'/reminder',
                  name:'Reminder',
                  component:()=>import('@/views/application/reminder/index.vue')
                },
                {
                  path:'/speechLab',
                  name:'SpeechLab',
                  component:()=>import('@/views/application/components/speechLab/index.vue'),
                },
                {
                  path:'/videoGeneration',
                  name:'VideoGeneration',
                  component:()=>import('@/views/application/components/speechLab/VideoGeneration/index.vue'),
                },
                {
                  path:'/musicGeneration',
                  name:'MusicGeneration',
                  component:()=>import('@/views/application/components/speechLab/musicGeneration/index.vue'),
                },
                {
                  path:'/wechatgptfunction',
                  name:'WeChatGPTFunction',
                  component:()=>import('@/views/application/components/speechLab/wechatgptfunction/index.vue'),
                },
                {
                  path:'/encodingDetector',
                  name:'encodingDetector',
                  component:()=>import('@/views/application/components/encodingDetector/index.vue'),
                },
                {
                  path:'/characterSquare',
                  name:'characterSquare',
                  component:()=>import('@/views/application/components/characterSquare/index.vue'),
                },
              ]
            },
            {
              path:'voiceInteraction',
              name:'voiceInteraction',
              component: ()=>import('../src/components/VoiceInteraction/index.vue')
            },
            {
              path: 'claudeCode',
              redirect: { path: '/main/codeHub', query: { agent: 'claudeCode' } }
            },
            {
              path: 'codex',
              redirect: { path: '/main/codeHub', query: { agent: 'codex' } }
            },
            {
              path: 'codeHub',
              name: 'codeHub',
              component: async () => (await import('@mindcraft/agent')).CodeHub,
              meta: { parent: '/main/codeHub' }
            }
        ]
    },
    {
        path: '/floatWin',
        name: 'floatWin',
        component: ()=>import('../src/components/floatWin/index.vue')
    },
    {
        path: '/cut',
        name: 'cut',
        component: ()=>import('../src/components/floatWin/cut.vue')
    },
    {
        path: '/side',
        name: 'side',
        component: ()=>import('../src/components/floatWin/side.vue')
    },
    {
        path: '/login',
        name: 'Login',
        component: ()=>import('@/components/Login.vue'),
    },
    {
        path: '/stream',
        name: 'Stream',
        component: ()=>import('@/components/Stream.vue'),
    },
    {
      // 绘图
      path:'/canvas',
      name:'ApplicationCanvas',
      component:()=>import('../src/components/applicationCanvas/index.vue')
    },
    {
      // html运行
      path:'/htmlRunDrwer',
      name:'htmlRunDrwer',
      component:()=>import('../src/components/codeRun/htmlRunDrwer.vue')
    },
    { path: '/redirect', component: null },
    {
      path: '/mdViewer',
      name: 'mdViewer',
      component: () => import('@/components/mdViewer/index.vue')
    },
];

// const router = createRouter({
//   history: createWebHistory(),
//   routes
// });
const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// 路由守卫
  router.beforeEach((to, _, next) => {
    if(to.name === 'floatWin') {
      next();
      return 
    } 
    if(_.name === 'floatWin') {
      next('/floatWin');
      return 
    }
    if (to.meta.requiresAuth) {
      // 在这里实现具体的认证逻辑
      // 例如，从localStorage中获取token，并判断是否存在
      const token = localStorage.getItem('access_token');
      if (token) {
        // 存在token，允许访问
        if(to.name === 'characterSquarePage' || to.name === 'characterSquare') {
          let url = `https://www.mindcraft.com.cn/activity/client/characterSquare/?token=${token}`
          if(window.VITE_NODE_ENV != 'production') {
            const baseURL = localStorage.getItem("baseURL")
            url = `https://www.mindcraft.com.cn/${baseURL.includes('grayapi') ? 'test' : 'activity'}/client/characterSquare/?token=${token}`
          }
          window.electronAPI.openSingleWindow({windowId:'characterSquare',url:url+'&t='+Date.now()})
          return next('/application')
        }
          return next();
      } else {
        // 不存在token，重定向到登录页面或其他处理
        return next('/login');
      }
    } else {
      // 不需要认证，直接允许访问
      next();
    }
  });

export default router;
