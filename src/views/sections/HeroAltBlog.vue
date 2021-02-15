<template>
  <v-theme-provider dark>
    <section
      id="hero-alt"
      style="width: 100%;"
    >
      <base-img
        :height="$vuetify.breakpoint.mdAndUp ? 400 : 225"
        :src="display_image()"
        transition="slide-y-transition"
        class="rounded"
        color="#45516b"
        flat
        max-width
        tile
      >
      <!--
        <v-row
          v-if="title"
          align="center"
          class="ma-0 fill-height text-center"
          justify="center"
        >
          <v-col cols="12">
            <base-heading
              :title="title"
              space="2"
              weight="500"
            />

            <base-divider
              color="primary"
              dense
            />

            <v-breadcrumbs
              :items="items"
              class="justify-center pa-0"
              divider=">"
            >
              <template v-slot:divider>
                <v-icon>mdi-forward</v-icon>
              </template>
            </v-breadcrumbs>
          </v-col>
        </v-row>
      -->
      </base-img>
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
    name: 'SectionHeroAltBlog',

    metaInfo () {
      return {
        changed: meta => {
          // this.title = meta.titleChunk.toUpperCase()
          this.imgSource = meta.imgSrc
        },
      }
    },

    data: () => ({
      title: '',
      imgSource: '',
    }),

    computed: {
      gradient () {
        const color = `${this.$vuetify.theme.themes.light.secondary}00`
        const overlay = RGBAtoCSS(HexToRGBA(color))

        return `to top, ${overlay}, ${overlay}`
      },
      items () {
        return [
          { text: 'HOME', to: '/' },
          { text: 'BLOG', to: '/blog' },
          { text: this.title },
        ]
      },
    },

    methods: {
      display_image () {
        try {
          return require(`@/${this.imgSource}`)
        } catch {
          return ''
        }
      },
    },

    provide: {
      heading: { align: 'center' },
    },
  }
</script>
