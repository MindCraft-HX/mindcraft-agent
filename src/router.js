import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
    {
        path: '/',
        redirect: () => {
            // 路由记忆：返回上次访问的路径，首次默认进 CodeHub
            const lastRoute = localStorage.getItem('mindcraft_agent_last_route');
            if (lastRoute && lastRoute !== '/login' && lastRoute !== '/redirect') {
                return lastRoute;
            }
            return '/main/codeHub';
        }
    },
    {
        path: '/main',
        name: 'MainLayout',
        component: () => import('./Main.vue'),
        children: [
            {
                path: 'codeHub',
                name: 'codeHub',
                component: async () => (await import('@mindcraft/agent')).CodeHub,
                meta: { parent: '/main/codeHub' }
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
                path: 'chat',
                redirect: '/main/codeHub'
            },
        ]
    },
    {
        path: '/mdViewer',
        name: 'mdViewer',
        component: () => import('@/components/mdViewer/index.vue')
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

    // 记录有效路由路径
    if (to.path !== '/redirect' && to.path !== '/') {
        localStorage.setItem('mindcraft_agent_last_route', to.path);
    }

    next();
});

export default router;
