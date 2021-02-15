<template>
  <v-theme-provider dark>
    <section
      id="hero-alt"
      class="px-5 py-5"
      style="margin-left:auto; margin-right:auto; max-width: 1400px;"
    >
      <v-parallax
        :src="img_src"
        :height="$vuetify.breakpoint.mdAndUp ? 200 : 400"
        class="rounded elevation-0"
      >
        <base-hero-alt-text
          class=""
          :title="title"
        />
      </v-parallax>
    </section>
  </v-theme-provider>
</template>

<script>
  // Components
  import {
    HexToRGBA,
    RGBAtoCSS,
  } from 'vuetify/lib/util/colorUtils'

  export default {
    name: 'SectionHeroAlt',

    metaInfo () {
      return {
        changed: meta => (this.title = meta.titleChunk.toUpperCase()),
      }
    },

    provide: {
      heading: { align: 'center' },
    },

    data: () => ({
      title: '',
    }),

    computed: {
      gradient () {
        const color = `${this.$vuetify.theme.themes.light.secondary}88`
        const overlay = RGBAtoCSS(HexToRGBA(color))

        return `to top, ${overlay}, ${overlay}`
      },
      img_src () {
        return this.$route.meta.src
      },
    },
  }
</script>
