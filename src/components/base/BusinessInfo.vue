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
    name: 'BaseBusinessInfo',

    props: {
      dark: Boolean,
      text: String,
      title: String,
    },

    data: () => ({
      business: [
        {
          icon: 'mdi-facebook',
          text: 'Daniel Nečesal',
          html: 'https://www.facebook.com/daniel.necesal/',
          iconColor: '#218df0',
        },
        {
          icon: 'mdi-instagram',
          text: 'Raccoon in the sun',
          html: 'https://www.instagram.com/raccoon.in.the.sun/',
          iconColor: '#f66c4a',
        },
        {
          icon: 'mdi-linkedin',
          text: 'Daniel Nečesal',
          html: 'https://www.linkedin.com/in/necesal-daniel/',
          iconColor: '#146fc8',
        },
      ],
    }),
  }
</script>
