<template>
  <base-section
    id="features"
    style="width: 100%;"
    class="pa-0"
  >
    <base-blog-post-head
      :date="date"
      :title="title"
    />
  </base-section>
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
      date: Date.now(),
      id: Math.random(),
      imgSource: 'assets/cube/IMG_0324.jpg',
      title: 'Base game and expansions available separately on Nintendo Switch!',
    }),
  }
</script>
