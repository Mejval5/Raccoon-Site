<template>
  <v-container
    class="px-5 ma-auto pb-5"
  >
    <v-row
      align="end"
      justify="center"
    >
      <v-col
        v-for="blogPost in blogPosts"
        :key="blogPost.id"
        cols="auto"
      >
        <base-blog-card
          :image="blogPost.imgSource"
          :bloglink="blogPost.file"
          samepage="true"
          :headline="blogPost.title"
          :subtitle="blogPost.subtitle"
          :text="trimText(blogPost.html)"
          :date="blogPost.date"
          :show-card="showAllCards"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>

  // Mixins
  import LoadBlogposts from '@/plugins/load-blogposts'

  export default {
    name: 'BlogPost',

    data: () => ({
      blogPosts: [],
      renderComponent: true,
      showAllCards: false,
    }),

    async beforeMount () {
      await this.get_blog_posts()
    },

    methods: {
      trimText (_text) {
        try {
          return _text.substr(0, 120) + '...'
        } catch {
          return ''
        }
      },
      async get_blog_posts () {
        this.blogPosts = await LoadBlogposts()

        this.forceRerender()
      },
      forceRerender () {
        // Remove my-component from the DOM

        this.$nextTick(() => {
          // Add the component back in
          this.showAllCards = false
          this.showCards()
        })
      },
      async showCards () {
        await new Promise(resolve => setTimeout(resolve, 200))
        this.showAllCards = true
      },
    },

  }
</script>
