<template>
  <v-footer
    id="home-footer"
    class="rounded-t-none mx-0 px-0 my-0 py-0"
    color="elevation1AppBar"
    style="z-index: 1500;"
    dark
    min-height="15"
  >
    <v-container
      class="pb-3 pt-4 mx-5"
      fluid
    >
      <v-row class="align-center py-0">
        <v-col
          cols="12"
          md="8"
          class="py-0"
        >
          <div class="d-flex flex-wrap justify-md-start justify-center justify-md-none align-center">
            <template v-for="(s, i) in social">
              <a
                :key="s.name"
                class="secondaryText pa-1 pa-md-0 text-body-2"
                :href="s.link"
                target="_blank"
                v-text="s.name"
              />

              <v-responsive
                v-if="i < social.length - 1"
                :key="`divider-${s.name}`"
                class="mx-4 mt-1 mt-md-0 shrink"
                max-height="20"
              >
                <v-divider vertical />
              </v-responsive>
            </template>
          </div>
        </v-col>

        <v-col
          class="text-center text-md-right secondaryText py-2 text-caption"
          cols="12"
          md="4"
        >
          Made by Raccoon5
        </v-col>
      </v-row>
    </v-container>
  </v-footer>
</template>

<script>
  export default {
    name: 'HomeFooter',

    data: () => ({
      social: [
        { name: 'Facebook', link: 'https://www.facebook.com/daniel.necesal/' },
        { name: 'Instagram', link: 'https://www.instagram.com/raccoon.in.the.sun/' },
        { name: 'LinkedIn', link: 'https://www.linkedin.com/in/necesal-daniel/' },
      ],
    }),
  }
</script>

<style lang="sass">
  #home-footer a
    text-decoration: none
</style>
