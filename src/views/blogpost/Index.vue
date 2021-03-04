
<template>
<div>
  <racc-stars />
  <v-overlay
      :value="true"
      opacity="0.3"
      class="d-block"
      >
  <v-container
    fluid
    class="pa-0 pt-3"
    style="max-width: 1360px;"
  >
  <v-row
      dense
      align="center"
      justify="center"
      class="d-block d-md-none mb-3 rounded"
    >
      <v-col
      class="mx-auto"
      cols="11"
      >
        <v-btn
          block
          color="transparent"
          elevation="0"
          class="rounded"
          @click="$router.push({
          path: '/blog',
          name: 'Blog',
          meta: { pageName: 'blogPage' },
          })"
        >
          <v-icon
            class="mr-auto"
          >
            mdi-keyboard-backspace
          </v-icon>
        </v-btn>
      </v-col>
    </v-row>
    <v-row
      justify="center"
      align="start"
      no-gutters
      class="pb-6"
      style="height: 100vh"
    >
              <v-col
            class="d-none d-md-block text-right py-0"
            align-self="stretch"
            cols="1"
          >
            <v-btn
            large
            class="rounded-lg d-block"
            style="height: 100%;"
            color="transparent"
            elevation="0"
            @click="$router.push({
            path: '/blog',
            name: 'Blog',
            meta: { pageName: 'blogPage' },
            })"
            >
              <v-icon>mdi-keyboard-backspace</v-icon>
            </v-btn>
          </v-col>
      <v-spacer
      class="d-block d-md-none"
      />
      <v-col
        cols="11"
      >
        <hero-alt
        class="pb-6"
        />
        <component :is="comp" />
      </v-col>
      <v-spacer />
    </v-row>
  </v-container>
  </v-overlay>
</div>
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
        return String(this.$route.params.blogId)
      },
      goTo404 () {
        this.$router.push('/404')
      },
    },

  }
</script>
