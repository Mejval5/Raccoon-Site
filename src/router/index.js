// Imports
import Vue from 'vue'
import Router from 'vue-router'
import goTo from 'vuetify/es5/services/goto'
const routes = require('./routes.js') // Import routes

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
  routes: routes,
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
