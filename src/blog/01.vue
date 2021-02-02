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
    name: 'SectionFeatures',

    props: {
      id: String,
    },

    metaInfo () {
      return {
        title: this.lol,
        imgSrc: this.imgSource,
      }
    },

    data: () => ({
      date: Date.now(),
      imgSource: 'assets/cube/IMG_0324.jpg',
      title: 'Base game and expansions available separately on Nintendo Switch!',
      cards: [
        {
          icon: 'mdi-keyboard-outline',
          title: 'Programming',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
        {
          icon: 'mdi-camera-outline',
          title: 'Photography',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
        {
          icon: 'mdi-pencil-outline',
          title: 'Brand Making',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
        {
          icon: 'mdi-puzzle-outline',
          title: '24/7 Support',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
      ],
    }),
  }
</script>
