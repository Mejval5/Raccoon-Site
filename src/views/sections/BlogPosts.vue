<template>
  <v-container
    class="px-5 ma-auto pb-5"
  >
    <v-row
      v-if="renderComponent"
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
          subtitle="First blog post"
          text="Random test"
          :show-card="showCards"
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
      showCards: false,
    }),

    async beforeMount () {
      console.log(this.showCards)
      await this.get_blog_posts()
      console.log(this.showCards)
    },

    methods: {
      async get_blog_posts () {
        this.blogPosts = await LoadBlogposts()

        this.forceRerender()
      },
      forceRerender () {
        // Remove my-component from the DOM
        this.renderComponent = false

        this.$nextTick(() => {
          // Add the component back in
          this.renderComponent = true
          this.showCards = true
        })
      },
    },

  }
</script>
