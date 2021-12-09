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
          pic: 'assets/me/dan.jpg',
          title: 'Game programmer',
          socialMedia: [
            { name: 'Instagram', link: 'instagram.com/raccoon.in.the.sun' },
            { name: 'LinkedIn', link: 'linkedin.com/in/necesal-daniel' },
            { name: 'GitHub', link: 'github.com/Mejval5' },
          ],
          text: `
            After finishing his Master's degree in Physics, Daniel Nečesal has decided to follow his lifelong passion of game making.
            He started devouring YouTube tutorials, then study Unity documentation, and finally made a few games on his own. <br><br>
            During 2020 quarantine he decided to partner up with his friend Milan Švancara to start the studio
             <a class="text-decoration-none linkText" href="https://octomancer.com/brotagonists" target="_blank"> Brotagonists™ </a> 
            .
          `,
        },
      }
    },
  }
</script>

<style>

</style>
