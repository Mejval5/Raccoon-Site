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
    name: 'Blog01',

    metaInfo () {
      return {
        title: this.lol,
        imgSrc: this.imgSource,
      }
    },

    data: () => ({
      date: Date.parse('February 20, 2021'),
      id: Math.random(),
      imgSource: 'assets/blog/OctomancerWeb.jpg',
      title: 'Octomancer website live!',
      subtitle: `
      <a class="text-decoration-none linkText" href="https://octomancer.com/" target="_blank"> Go there yourself! </a>
      `,
      html: `
        Our lovely Octomancer project is taking off. <br>
        If you want to sign up for closed Beta or learn more click the link bellow. <br>
        More is coming SOON!
        <br> <br>
        <a class="text-decoration-none linkText" href="https://octomancer.com/" target="_blank"> Go there yourself! </a>
      `,
    }),
  }
</script>
