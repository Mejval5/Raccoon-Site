<template>
  <base-section id="theme-features">
    <base-section-heading title="Hello there!">
      My name is Daniel Nečesal. I am an indie game developer based in Brno, Czech Republic.
      <br>On this site I would like to share the progress of my current projects and
    </base-section-heading>

    <v-container>
      <v-row
        justify="center"
      >
        <v-col
          v-for="(feature, i) in features"
          :key="i"
          cols="auto"
        >
          <base-avatar-card
            v-bind="feature"
            align="left"
            horizontal
          />
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
