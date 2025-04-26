const routes = require('./src/router/routes.js') // Import routes
const PrerenderSPAPlugin = require('prerender-spa-plugin')
const fs = require('fs')
const path = require('path')

// Function to dynamically collect blog posts from the `/blog/` folder
function getBlogPostPaths () {
  const blogDirectory = path.join(__dirname, 'src/blog')
  const blogFiles = fs.readdirSync(blogDirectory) // Read all files from the blog directory

  // Remove `.vue` extension and create paths for each blog post
  return blogFiles
    .filter(file => file.endsWith('.vue')) // Only consider .vue files
    .map(file => `/blogpost/${file.replace('.vue', '')}`) // Remove extension and build path
}

const languages = ['en', 'fr'] // Supported languages
console.log('Routes imported:', routes) // Debugging line to check if routes are loaded

// Function to collect routes dynamically
function collectRoutes (routes) {
  const routePaths = []

  routes.forEach(route => {
    if (route.children) {
      routePaths.push(...collectRoutes(route.children))
    } else {
      // Handle dynamic paths
      if (route.path.includes(':blogId')) {
        // Generate paths for blog post pages dynamically
        routePaths.push(...getBlogPostPaths())
      } else if (route.path.includes(':lang?')) {
        // Generate paths for languages
        languages.forEach(lang => {
          routePaths.push(route.path.replace(':lang?', lang))
        })
      } else if (route.path === '*') {
        // Skip wildcard route for pre-rendering
      } else {
        routePaths.push(route.path)
      }
    }
  })

  return routePaths
}

// Collect all route paths dynamically
const staticRoutes = collectRoutes(routes)

console.log('Pre-rendering routes:', staticRoutes) // Debugging line to check collected routes

module.exports = {
  devServer: {
    disableHostCheck: true,
  },
  transpileDependencies: [
    'vuetify',
  ],
  configureWebpack: config => {
    if (process.env.NODE_ENV === 'production') {
      config.plugins.push(
        new PrerenderSPAPlugin({
          staticDir: path.join(__dirname, 'dist'),
          routes: staticRoutes, // Use dynamically collected routes
          renderer: new PrerenderSPAPlugin.PuppeteerRenderer({
            renderAfterDocumentEvent: 'render-event', // Listen for the custom render event
          }),
        }),
      )
    }
  },
}
