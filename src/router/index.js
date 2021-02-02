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
          path: '',
          name: 'Home',
          component: () => import('@/views/home/Index.vue'),
        },
        {
          path: 'about',
          name: 'About',
          component: () => import('@/views/about/Index.vue'),
          meta: { src: require('@/assets/IMG_0391.jpg') },
        },
        {
          path: 'blog',
          name: 'Blog',
          component: () => import('@/views/blog/Index.vue'),
          meta: { src: require('@/assets/me.jpg') },
        },
        {
          path: 'contact',
          name: 'Contact',
          component: () => import('@/views/contact/Index.vue'),
          meta: { src: require('@/assets/IMG_0031.jpg') },
        },
        {
          path: 'games',
          name: 'Games',
          component: () => import('@/views/games/Index.vue'),
          meta: { src: require('@/assets/IMG_2162.jpg') },
        },
        {
          path: 'octomancer',
          name: 'Octomancer',
          component: () => import('@/views/octomancer/Index.vue'),
          meta: { src: require('@/assets/pro.jpg') },
        },
        {
          path: '/blogpost/:id',
          name: 'BlogPost',
          component: () => import('@/views/blogpost/Index.vue'),
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
