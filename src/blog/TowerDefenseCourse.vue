<template>
  <v-container
    fluid
    class="pa-0 top_align"
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
      date: Date.parse('November 21, 2021'),
      id: Math.random(),
      imgSource: 'assets/blog/towerDefenseMain.png',
      previewImgSource: 'assets/blog/towerDefensePreview.png',
      title: 'I created a tower defense course in Unity!',
      subtitle: 'Learning can be fun',
      html: `
        I partnered up with Learn 2 Code to create a new game development course. <br>
        The course is designed to introduce beginners in the game making process and show them the basics. <br>
        I chose Unity as my vehicle and the genre of tower defense. <br>
        Right now the course is publicly available at <a class="text-decoration-none linkText" href="https://learn2code.cz/kurzy/tower-defense-game-v-unity" target="_blank"> Learn2Code</a> website.
      `,
    }),
  }
</script>
