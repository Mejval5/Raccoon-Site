<template>
  <v-theme-provider :dark="dark">
    <div>
      <base-info-card
        :title="title"
        :text="text"
        color="primary"
        pace="6"
      />

      <base-business-contact
        dense
        :business="business"
      />
    </div>
  </v-theme-provider>
</template>

<script>
  export default {
    name: 'ProjectsInfo',

    props: {
      dark: Boolean,
      text: String,
      title: String,
    },

    data: () => ({
      business: [
        {
          icon: 'mdi-github',
          text: 'Raccoon5',
          html: 'https://github.com/Mejval5',
          iconColor: '',
        },
        {
          icon: 'mdi-youtube',
          text: 'Awakened Raccoon',
          html: 'https://www.youtube.com/channel/UCnW-PUaJWwDjzvorrBTgbWw',
          iconColor: 'red',
        },
        {
          icon: 'mdi-controller',
          text: 'Raccoon5',
          html: 'https://raccoon5.itch.io/',
          iconColor: 'orange',
        },
      ],
    }),
  }
</script>
