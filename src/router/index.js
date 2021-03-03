// Imports
import Vue from 'vue'
import Router from 'vue-router'
import goTo from 'vuetify/es5/services/goto'

Vue.use(Router)

const router = new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  scrollBehavior (to, from, savedPosition) {
    if (to.path === from.path && to.name !== from.name) {
      return goTo(to.hash, { easing: 'easeInOutQuad', duration: 1500 })
    }
    return new Promise(resolve => this.app.$once('scrollAfterEnter', () => {
        if (savedPosition) {
            return resolve(savedPosition)
        }
        if (to.hash) {
          return goTo(to.hash, { easing: 'easeInOutQuad', duration: 1500 })
        }

        return resolve({ x: 0, y: 0 })
    }))
},
  routes: [
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
          path: '/games',
          name: 'Games',
          meta: { pageName: 'gamesPage' },
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
          path: '*',
          redirect: '/',
        },
      ],
    },
  ],
})

export default router
