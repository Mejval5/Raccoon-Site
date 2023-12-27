<template>
  <div
    class="pb-0"
    style="z-index: 1501;"
  >
    <v-app-bar
      id="home-app-bar"
      class="rounded-b-0 elevation1AppBar mx-0"
      elevation="0"
      height="50"
      :to="'home'"
    >
      <v-tab
        class="mx-3 px-0"
        style="min-width: 0px;"
        to="/"
      >
        <base-img
          :src="require('@/assets/racc-dark-rect.svg')"
          contain
          max-width="45"
          width="100%"
        />
      </v-tab>

      <v-tab
        class="font-weight-bold text-subtitle-2 siteText px-3"
        min-width="96"
        text
        to="/"
      >
        Raccoon site
      </v-tab>
      <!--
      <base-img
        :src="require('@/assets/zero-logo-light.svg')"
        contain
        max-width="128"
        width="100%"
      />
      -->
      <v-spacer />

      <div>
        <v-tabs
          class="hidden-sm-and-down"
          optional
          height="auto"
          ripple="false"
        >
          <v-tab
            v-for="(link, i) in links"
            :key="i"
            :exact="link.name === 'Home'"
            :to="{ name: link.name, hash: link.hash }"
            active-class="navTextSelected"
            class="font-weight-bold text-subtitle-2 navText"
            min-width="96"
            text
          >
            <v-hover v-slot="{ hover }">
              <div
                :class="{ 'navTextHover': hover }"
              >
                {{ link.name }}
              </div>
            </v-hover>
          </v-tab>
        </v-tabs>
      </div>

      <v-app-bar-nav-icon
        class="hidden-md-and-up pr-10 linkText"
        @click="drawer = !drawer"
      />
    </v-app-bar>

    <home-drawer
      v-model="drawer"
      :links="links"
    />
  </div>
</template>

<script>
  import goTo from 'vuetify/es5/services/goto'
  export default {
    name: 'HomeAppBar',

    components: {
      HomeDrawer: () => import('./Drawer'),
    },

    data: () => ({
      drawer: null,
      lastPage: null,
      links: [
        { name: 'Home', hash: '' },
        { name: 'About', hash: '' },
        { name: 'Games', hash: '' },
        { name: 'Blog', hash: '' },
        { name: 'Octomancer', hash: '' },
        { name: 'Contact', hash: '' },
      ],
    }),
  }
</script>

<style lang="sass">
  #home-app-bar
    .v-tabs-slider
      max-width: 24px
      margin: 0 auto
      background: #1eb980 !important
      display: none

    .v-tab
      &::before
        background-color: #FFFFFF
        border-radius: 20px
        display: none

    .v-tab > .v-ripple__container
      border-radius: 20px
      display: none

    .theme--dark.v-tabs > .v-tabs-bar
      border-radius: 20px
</style>

<style lang="scss">
.elevation-n1 {
  box-shadow: inset 0 0px 10px black !important;
}
</style>
