<template>
  <v-fade-transition
    mode="out-in"
    appear
    @after-enter="afterEnter"
  >
    <section
      id="hero"
      class="px-10 py-5"
    >
      <v-parallax
        :src="get_pic"
        class="rounded elevation-0"
        :height="$vuetify.breakpoint.mdAndUp ? 500 : 400"
      >
        <base-hero-text class="d-none d-md-block" />
      </v-parallax>
      <base-hero-text
        class="d-md-none"
        elevated
      />
    </section>
  </v-fade-transition>
</template>

<script>
  export default {
    name: 'SectionHero',

    provide: {
      theme: { isDark: true },
    },

    computed: {
      minHeight () {
        const height = this.$vuetify.breakpoint.mdAndUp ? '30vh' : '25vh'

        return `calc(${height} - ${this.$vuetify.application.top}px)`
      },
      get_pic () {
        return this.$vuetify.breakpoint.mdAndUp ? require('@/assets/picked/front.jpg') : require('@/assets/picked/front_mobile.jpg')
      },
    },
    methods: {
      afterEnter () {
        this.$root.$emit('scrollAfterEnter')
      },
    },
  }
</script>

<style lang='scss'>
.bg-trans {
  background-color: #000000AA !important;
}
.v-parallax__content
{
  padding-left: 0px !important;
  padding-right: 0px !important;
}
.repeating-gradient {
    background-image: repeating-linear-gradient(-45deg,
                        rgba(0,0,0,0),
                        rgba(0,0,0,0) 5px,
                        rgba(0,0,255,.25) 5px,
                        rgba(0,0,255,.25) 10px
                      );
  }
.elevation-n1 {
  box-shadow: inset 0px 10px 10px -10px black !important;
}
</style>
