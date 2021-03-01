<template>
  <v-container>
    <octo-dev-info
      :dev-info="devs[0]"
      class="mb-5"
    />
    <v-divider
      class="mb-10"
    />
    <octo-dev-info
      :dev-info="devs[1]"
      reverse
    />
  </v-container>
</template>

<script>
  export default {
    data () {
      return {
        devs: [],
        devInfo1: {
          name: 'Daniel Nečesal',
          pic: 'assets/us/dan.jpg',
          title: 'Project director / Game programmer',
          socialMedia: [
            { name: 'Facebook', link: 'facebook.com/daniel.necesal' },
            { name: 'Instagram', link: 'instagram.com/raccoon.in.the.sun' },
            { name: 'LinkedIn', link: 'linkedin.com/in/necesal-daniel' },
          ],
          text: `
            After finishing his Master's degree in Physics, Daniel Nečesal has decided to follow his lifelong passion of game making.
            He started devouring YouTube tutorials, then study Unity documentation, and finally made a few games on his own. <br>
            During 2020 quarantine he decided to partner up with his friend Milan Švancara to start the studio Brotagonists™.
          `,
        },
        devInfo2: {
          name: 'Milan Švancara',
          pic: 'assets/us/milan.jpg',
          title: 'Art director / Producer',
          socialMedia: [
            { name: 'Facebook', link: 'facebook.com/milan.svancara' },
            { name: 'Instagram', link: 'instagram.com/svancaramilan' },
            { name: 'Website', link: 'svancarastrings.com' },
          ],
          text: `
            Milan Švancara (aka Svancara Strings) has been creating graphical art and music for over 10 years.
            In 2020 he has been motivated to share his art with the rest of the world. <br>
            He specializes in orchestral music with focus on story-telling.
            He considers art as a channel through which he can share parts of his stories and emotions
            hoping to inspire the same feelings in others.
          `,
        },
      }
    },
    created () {
      this.scrambleDevs()
    },
    methods: {
      scrambleDevs () {
        const rand = Math.random()
        if (rand > 0.5) {
          this.devs[0] = this.devInfo1
          this.devs[1] = this.devInfo2
        } else {
          this.devs[0] = this.devInfo2
          this.devs[1] = this.devInfo1
        }
      },
    },
  }
</script>

<style>

</style>
