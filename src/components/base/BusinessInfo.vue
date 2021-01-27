<template>
  <v-theme-provider :dark="dark">
    <div>
      <base-info-card
        :title="title"
        :text="text"
        pace="6"
      >
      </base-info-card>

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
        },
        {
          icon: 'mdi-instagram',
          text: 'Raccoon in the sun',
          html: 'https://www.instagram.com/raccoon.in.the.sun/',
        },
        {
          icon: 'mdi-linkedin',
          text: 'Daniel Nečesal',
          html: 'https://www.linkedin.com/in/necesal-daniel/',
        },
      ],
    }),
  }
</script>
