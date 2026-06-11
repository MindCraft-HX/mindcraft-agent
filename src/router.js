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
            // 只接受 /main 下的路由，防止悬浮球等子窗口路由（/side、/cut、/floatWin）
            // 通过共享 localStorage 污染主窗口导致白屏
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
                redirect: '/main/codeHub'
            },
            {
                path: 'mdViewer',
                name: 'mdViewer',
                component: () => import('@/components/mdViewer/index.vue'),
                meta: { parent: '/main/mdViewer' }
            },
        ]
    },
    {
        path: '/mdViewer',
        redirect: '/main/mdViewer'
    },
    {
        path: '/floatWin',
        name: 'floatWin',
        component: () => import('../src/components/floatWin/index.vue')
    },
    {
        path: '/cut',
        name: 'cut',
        component: () => import('../src/components/floatWin/cut.vue')
    },
    {
        path: '/side',
        name: 'side',
        component: () => import('../src/components/floatWin/side.vue')
    },
    { path: '/redirect', component: null },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

// 路由记忆：记录最后访问的页面路径
router.beforeEach((to, from, next) => {
    // 浮动窗口绕过
    if (to.name === 'floatWin' || from.name === 'floatWin') {
        if (from.name === 'floatWin') {
            next('/floatWin');
            return;
        }
        next();
        return;
    }

    // 记录有效路由路径（仅主窗口路由，子窗口路由不参与记忆）
    if (to.path.startsWith('/main')) {
        localStorage.setItem('mindcraft_agent_last_route', to.path);
    }

    next();
});

export default router;
