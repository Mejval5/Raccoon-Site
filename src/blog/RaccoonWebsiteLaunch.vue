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
      date: Date.parse('March 4, 2021'),
      id: Math.random(),
      imgSource: 'assets/blog/RaccoonWeb.jpg',
      title: 'Raccoon website has been deployed!',
      subtitle: 'You are looking at it',
      html: `
        After a long wait, the Raccoon website has been launched. <br>
        The website features games I worked on, my blog, and contact information. <br>
        <br>
        You should be excited for new and fun content coming in the future.
      `,
    }),
  }
</script>
