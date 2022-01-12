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
      date: Date.parse('August 1, 2021'),
      id: Math.random(),
      imgSource: 'assets/blog/caminoBig.png',
      previewImgSource: 'assets/blog/caminoPreview.jpg',
      title: 'I walked the camino portugese!',
      subtitle: 'Maybe you\'ve walked it',
      html: `
        I went on a big journey this summer. First, I rode on my motorcycle to the portugal. I bought the
        famous BWM GS650 F, and a week later departed for the biggest adventure of my life. The ride was
        exhausting, but a two week stop to regain strengths at my mom's house in Switzerland allowed me to continue. <br> <br>
        In portugal, I put on my trusty little backpack and started walking. My legs ached, but soon I picked up the
        pace, and felt rather energetic for each day to come. It didn't take long and I was finally in Santiago. <br> <br>
        I picked up my motorcycle, and continued on my journey back to Czech Republic.
        `,
    }),
  }
</script>
