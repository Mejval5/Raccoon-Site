<template>
  <v-container fluid>
    <octo-dev-info
      :dev-info="devInfo1"
    />
  </v-container>
</template>

<script>
  export default {
    data () {
      return {
        devInfo1: {
          name: 'DANIEL NEČESAL',
          pic: 'assets/me_two.jpg',
          title: 'Game developer',
          socialMedia: [
            { name: 'Instagram', link: 'instagram.com/raccoon.in.the.sun' },
            { name: 'LinkedIn', link: 'linkedin.com/in/necesal-daniel' },
            { name: 'GitHub', link: 'github.com/Mejval5' },
          ],
        },
      }
    },
  }
</script>

<style>

</style>
