<template>
  <base-section id="theme-features">
    <base-section-heading title="Theme Features">
      Lorem ipsum dolor sit amet consectetur adipisicing elit. Libero, in! Asperiores, impedit libero. Veniam rerum saepe unde nihil possimus quibusdam esse accusamus mollitia magni fuga.
    </base-section-heading>

    <v-container>
      <v-row
      justify="center"
      >
        <v-col
          v-for="(feature, i) in features"
          :key="i"
          cols= "4"
        >
          <base-avatar-card
            v-bind="feature"
            align="left"
            horizontal
          >
          </base-avatar-card>
        </v-col>
      </v-row>
    </v-container>
  </base-section>
</template>

<script>
  export default {
    name: 'SectionThemeFeatures',

    data: () => ({
      feature: '',
      features: [
        {
          title: 'Pixel Perfect Design',
          icon: 'mdi-fountain-pen-tip',
          text: 'haha',
        },
        {
          title: 'Retina Ready',
          icon: 'mdi-cellphone',
          text: 'xx',
        },
        {
          color: 'primary',
          dark: true,
          title: 'Easily Customizable',
          icon: 'mdi-pencil-box-outline',
          text: 'qq',
        },
        {
          title: 'Image Parallax',
          icon: 'mdi-image-size-select-actual',
          text: 'aasd',
        },
        {
          title: 'Seo Optimized',
          icon: 'mdi-ice-pop',
          text: 'ggg',
        },
        {
          title: '24/7 Support',
          icon: 'mdi-help-circle-outline',
          text: 'ee',
        },
      ],
    }),
  }
</script>
