<template>
  <div>
    <v-app-bar
      id="home-app-bar"
      app
      color=""
      elevation="1"
      height="80"
      v-bind:to="'home'"
      sticky
    >
      <v-tab
      class="mx-3 px-0"
      style="min-width: 0px;"
      to="/"
      >
        <base-img
          :src="require('@/assets/racc-dark.svg')"
          contain
          max-width="55"
          width="100%"
        />
      </v-tab>

      <v-tab
        active-class="text--primary"
        class="font-weight-bold headline hidden-xs-only"
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
        >
          <v-tab
            v-for="(link, i) in links"
            :key="i"
            :exact="link.name === 'Home'"
            :ripple="false"
            :to="{ name: link.name, hash: link.hash }"
            active-class="text--primary"
            class="font-weight-bold"
            min-width="96"
            text
          >
            {{ link.name }}
          </v-tab>
        </v-tabs>
      </div>

      <v-app-bar-nav-icon
        class="hidden-md-and-up mr-2"
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

    .v-tab
      &::before
        display: none

    .theme--dark.v-tabs > .v-tabs-bar
      background-color: #1e1e1e00 !important
</style>
