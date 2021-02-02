// Utilities
import {
  camelCase,
  upperFirst,
} from 'lodash'

export default function (sections = []) {
  // Load every component from _common
  const req = require.context('@/blog/', false, /\.(js|vue)$/i)
  for (const key of req.keys()) {
    const name = key.match(/\w+/)[0]
    sections.push(name)
  }
  return {
    name: 'LoadBlogposts',

    // Iterates the provide list of components
    // and returns a function that returns a
    // Promise.
    components: sections.reduce((acc, cur) => {
      const name = upperFirst(camelCase(cur))
      const test = import('@/blog/01.vue').then((output) =>
        sections.push(output.default.props.date),
      )
      // console.log(sections)

      acc[`Section${name}`] = () => import('@/blog/01.vue')
      acc.SectionHeroAlt = () => import('@/views/sections/HeroAlt.vue')

      return acc
    }, {}),

    data: () => ({ sections }),
  }
}
