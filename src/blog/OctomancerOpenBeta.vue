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
      date: Date.parse('June 28, 2021'),
      id: Math.random(),
      imgSource: 'assets/blog/OctoIntro.jpg',
      previewImgSource: 'assets/blog/OctoIntro.jpg',
      title: 'Octomancer open beta launched!',
      subtitle: 'Go play it now!',
      html: `
        Octomancer is now in open beta. <br>
        Any help would be greatly appreciated in testing the game. <br>
        To try it out, go to <a class="text-decoration-none linkText" href="https://octomancer.com/octomancer" target="_blank"> Octomancer.com/octomancer </a> <br>
      `,
    }),
  }
</script>
