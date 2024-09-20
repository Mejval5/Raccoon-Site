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
  ],
})

router.beforeEach((to, from, next) => {
  // Check if the route has a meta title
  if (to.meta && to.meta.title) {
    document.title = to.meta.title
  } else {
    document.title = 'Raccoon Website' // Fallback title
  }
  function updateMetaTag (property, content) {
    let tag = document.querySelector(`meta[property="${property}"]`)
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('property', property)
      document.head.insertBefore(tag, document.head.firstChild)
    }
    tag.setAttribute('content', content)
  }

  // Dynamically update or create Open Graph meta tags
  if (to.meta.ogTitle) {
    updateMetaTag('og:title', to.meta.ogTitle)
  }
  if (to.meta.ogDescription) {
    updateMetaTag('og:description', to.meta.ogDescription)
  }
  if (to.meta.ogImage) {
    updateMetaTag('og:image', to.meta.ogImage)
  }
  if (to.meta.ogUrl) {
    updateMetaTag('og:url', to.meta.ogUrl)
  }
  if (to.meta.ogType) {
    updateMetaTag('og:type', to.meta.ogType)
  }
  next()
})

export default router
