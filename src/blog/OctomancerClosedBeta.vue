<template>
  <v-container
    fluid
    class="pa-0"
  >
    <base-blog-post-head
      :date="date"
      :title="title"
      class="mb-3"
    />
    <base-body
      class="secondaryText"
      :html="html"
    />
  </v-container>
</template>

<script>
  export default {
    name: 'Blog02',

    metaInfo () {
      return {
        title: this.lol,
        imgSrc: this.imgSource,
      }
    },

    data: () => ({
      date: Date.parse('December 17, 2020'),
      id: Math.random(),
      imgSource: 'assets/blog/OctomancerBeta.jpg',
      title: 'Octomancer closed beta launched!',
      subtitle: 'Maybe you\'ve played it',
      html: `
        We have released closed beta for you Octomancer game. <br>
        Right now we have the release available for friends who want to help. <br> <br>

        Any help would be greatly appreciated in testing the game. <br>
        To sign up please go to <a class="text-decoration-none linkText" href="https://octomancer.com/octomancer" target="_blank"> Octomancer.com/octomancer </a> <br>
      `,
    }),
  }
</script>
