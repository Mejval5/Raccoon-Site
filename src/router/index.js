// Imports
import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

const router = new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  scrollBehavior: (to, from, savedPosition) => {
    if (to.hash) return { selector: to.hash }
    if (savedPosition) return savedPosition

    return { x: 0, y: 0 }
  },
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/home/Index.vue'),
      children: [
        {
          path: '',
          name: 'Home',
          component: () => import('@/views/home/Index.vue'),
        },
        {
          path: 'about',
          name: 'About',
          component: () => import('@/views/about/Index.vue'),
          meta: { src: require('@/assets/about.jpg') },
        },
        {
          path: 'blog',
          name: 'Blog',
          component: () => import('@/views/blog/Index.vue'),
          meta: { src: require('@/assets/about.jpg') },
        },
        {
          path: 'contact',
          name: 'Contact',
          component: () => import('@/views/contact/Index.vue'),
          meta: { src: require('@/assets/contact.jpg') },
        },
        {
          path: 'games',
          name: 'Games',
          component: () => import('@/views/games/Index.vue'),
          meta: { src: require('@/assets/pro.jpg') },
        },
        {
          path: 'octomancer',
          name: 'Octomancer',
          component: () => import('@/views/octomancer/Index.vue'),
          meta: { src: require('@/assets/pro.jpg') },
        },
        {
          path: '*',
          name: 'FourOhFour',
          component: () => import('@/views/404/Index.vue'),
        },
      ],
    },

  ],
})

export default router
