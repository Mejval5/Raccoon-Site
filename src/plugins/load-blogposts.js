// Utilities
import {
  camelCase,
  upperFirst,
} from 'lodash'
import { VAppBarNavIcon } from 'vuetify/lib'

export default async function () {
  // Load every component from _common
  var blogPostNames = []
  var blogPosts = []

  const req = require.context('@/blog/', false, /\.(js|vue)$/i)

  for (const key of req.keys()) {
    var name = key.match(/\w+/)[0]

    var blogPostPromise = await import(`@/blog/${name}.vue`)
    var blogPost = blogPostPromise.default.data()
    blogPost.file = `blogpost/${name}`
    blogPosts.push(blogPost)
  }

  return blogPosts
}
