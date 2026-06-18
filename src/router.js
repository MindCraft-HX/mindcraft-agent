import { createRouter, createWebHashHistory } from 'vue-router';
import { AGENT_DEFINITIONS } from '@mindcraft/agent';

// 从 Registry 动态生成 Agent 重定向路由
const agentRedirectRoutes = AGENT_DEFINITIONS.map((agent) => ({
    path: agent.routeAlias,
    redirect: { path: '/main/codeHub', query: { agent: agent.key } }
}));

const routes = [
    {
        path: '/',
        redirect: () => {
            // 路由记忆：返回上次访问的路径，首次默认进首页
            // 只接受 /main 下的路由
            const lastRoute = localStorage.getItem('mindcraft_agent_last_route');
            if (lastRoute && lastRoute.startsWith('/main')) {
                return lastRoute;
            }
            return '/main/home';
        }
    },
    {
        path: '/main',
        name: 'MainLayout',
        component: () => import('./Main.vue'),
        children: [
            {
                path: 'home',
                name: 'home',
                component: () => import('@/views/Home.vue'),
                meta: { parent: '/main/home' }
            },
            {
                path: 'codeHub',
                name: 'codeHub',
                component: async () => (await import('@mindcraft/agent')).CodeHub,
                meta: { parent: '/main/codeHub' }
            },
            ...agentRedirectRoutes,
            {
                path: 'chat',
                name: 'chat',
                component: () => import('@mindcraft/agent').then(m => m.ChatView),
                meta: { parent: '/main/chat' }
            },
            {
                path: 'mdViewer',
                name: 'mdViewer',
                component: () => import('@/components/mdViewer/index.vue'),
                meta: { parent: '/main/mdViewer' }
            },
            {
                path: 'pluginMarket',
                name: 'pluginMarket',
                component: () => import('@/views/PluginMarket.vue'),
                meta: { parent: '/main/pluginMarket' }
            },
            {
                path: 'plugin/:pluginId',
                name: 'pluginView',
                component: () => import('@/views/PluginView.vue'),
                meta: { parent: null }
            },
        ]
    },
    {
        path: '/mdViewer',
        redirect: '/main/mdViewer'
    },
    { path: '/redirect', component: null },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

// 路由记忆：记录最后访问的页面路径
router.beforeEach((to, from, next) => {
    // 记录有效路由路径
    if (to.path.startsWith('/main')) {
        localStorage.setItem('mindcraft_agent_last_route', to.path);
    }

    // 插件路由：设置 meta.parent 为自身路径，用于侧边栏 active 高亮
    if (to.path.startsWith('/main/plugin/')) {
        to.meta.parent = to.path;
    }

    next();
});

export default router;
