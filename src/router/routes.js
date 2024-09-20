const routes = [
    {
        path: '/',
        component: () => import('@/layouts/home/Index.vue'),
        children: [
        {
            path: '/',
            name: 'Home',
            meta: { pageName: 'mainMenu' },
            component: () => import('@/views/main/Index.vue'),
        },
        {
            path: '/about',
            name: 'About',
            meta: { pageName: 'aboutPage' },
            component: () => import('@/views/main/Index.vue'),
        },
        {
            path: '/projects',
            name: 'Projects',
            meta: { pageName: 'projectsPage' },
            component: () => import('@/views/main/Index.vue'),
        },
        {
            path: '/blog',
            name: 'Blog',
            meta: { pageName: 'blogPage' },
            component: () => import('@/views/main/Index.vue'),
        },
        {
            path: '/blogpost/:blogId',
            name: 'Blogpost',
            component: () => import('@/views/blogpost/Index.vue'),
        },
        {
            path: '/contact',
            name: 'Contact',
            meta: { pageName: 'contactPage' },
            component: () => import('@/views/main/Index.vue'),
        },
        {
            path: '/preverenges',
            name: 'Préverenges',
            meta: { 
            pageName: 'preverenges', 
            title: 'Préverenges Apartment', 
            ogTitle: 'Préverenges Apartment', 
            ogDescription: 'Apartment to rent near Préverenges beach.', 
            ogImage: '@/assets/preverenges/postel.jpg',
            ogUrl: 'https://raccoon-website/preverenges',
            ogType: 'website',
            },
            component: () => import('@/views/preverenges/Index.vue'),
        },
        {
            path: '/preverenges/:lang?',
            name: 'Préverenges',
            meta: { 
            pageName: 'preverenges', 
            title: 'Préverenges Apartment', 
            ogTitle: 'Préverenges Apartment', 
            ogDescription: 'Apartment to rent near Préverenges beach.', 
            ogImage: '/postel.jpg',
            ogUrl: 'https://raccoon-website/preverenges',
            ogType: 'website',
            },
            component: () => import('@/views/preverenges/Index.vue'),
        },
        {
            path: '*',
            redirect: '/',
        },
        ],
    },
]

module.exports = routes
