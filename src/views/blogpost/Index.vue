
<template>
  <v-container
    fluid
    class="pa-0 pt-sm-3"
    style="max-width: 1360px;"
  >
    <v-row
      justify="center"
      align="center"
      no-gutters
    >
      <v-spacer />
      <v-col
        cols="auto"
        xl="auto"
        sm="11"
      >
        <hero-alt />
        <component :is="comp" />
      </v-col>
      <v-spacer />
    </v-row>
  </v-container>
</template>

<script>
  // Extensions
  import View from '@/views/View'

  export default {
    name: 'BlogPost',

    components: {
      HeroAlt: () => import('@/views/sections/HeroAltBlog'),
    },

    extends: View,

    props: {
      id: {
        type: String,
        default: 'blog',
      },
      currentBlogPost: String,
    },

    computed: {
      comp () {
        try {
          require(`@/blog/${this.currentRoute()}.vue`)
        } catch (e) {
          this.goTo404()
        }
        return () => import(`@/blog/${this.currentRoute()}.vue`)
      },
    },

    methods: {
      currentRoute () {
        return String(this.$route.params.id)
      },
      goTo404 () {
        this.$router.push('/404')
      },
    },

  }
</script>
