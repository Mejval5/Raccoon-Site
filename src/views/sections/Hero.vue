<template>
  <v-fade-transition
  mode="out-in"
  @after-enter="afterEnter"
  appear
  >
  <section id="hero">
    <v-parallax
    :src="require('@/assets/test.jpg')"
    :height="$vuetify.breakpoint.mdAndUp ? 500 : 400"
    class="pa-0"
    >
    <v-img
      :height="$vuetify.breakpoint.mdAndUp ? 500 : 400"
      style="width:100%; !important"
      gradient="to right, rgba(5, 11, 31, .4), rgba(5, 11, 31, .6)"
    >
      <v-container class="fill-height px-4 py-6">
        <v-responsive
          class="d-flex align-center"
          height="100%"
          width="100%"
        >
          <base-heading title="Welcome" />

          <base-body
          class="text--lighten-3"
          >
            My name is Daniel Nečesal. I am an indie game developer based in Brno, Czech Republic. <br>
            On this site I would like to share the progress of my current projects and
          </base-body>

          <div
            :class="$vuetify.breakpoint.smAndDown ? 'flex-column align-start' : 'align-center'"
            class="d-flex flex-wrap"
          >

            <base-btn
              :ripple="false"
              class="pa-1"
              height="auto"
              text
            >
              Get Started Now
            </base-btn>
          </div>
        </v-responsive>
      </v-container>
    </v-img>
    </v-parallax>
  </section>
  </v-fade-transition>
</template>

<script>
  export default {
    name: 'SectionHero',

    provide: {
      theme: { isDark: true },
    },
    methods: {
      afterEnter () {
        this.$root.$emit('scrollAfterEnter')
      },
    },

    computed: {
      minHeight () {
        const height = this.$vuetify.breakpoint.mdAndUp ? '30vh' : '25vh'

        return `calc(${height} - ${this.$vuetify.application.top}px)`
      },
    },
  }
</script>

<style lang='scss'>
.v-parallax__content
{
  padding-left: 0px !important;
  padding-right: 0px !important;
}
</style>
