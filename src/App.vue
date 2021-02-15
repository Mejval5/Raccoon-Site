<template>
  <v-fade-transition
    mode="out-in"
    appear
    @after-enter="afterEnter"
  >
    <router-view />
  </v-fade-transition>
</template>

<script>
  export default {
    name: 'App',
    metaInfo: {
      titleTemplate: '%s',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
    methods: {
      afterEnter () {
        this.$root.$emit('scrollAfterEnter')
      },
    },
  }
</script>

<style lang="sass">
  .extra-padding
    padding-bottom: 96px !important
    padding-top: 96px !important

    @media screen and (max-width: 959px)
      padding-top: 48px !important
      padding-bottom: 48px !important
</style>

<style global>
.theme--dark.v-application {
  background-color: #081214 !important;
}
.theme--dark .overlay {
  background-color: #081214df !important;
}
.theme--dark .elevation1AppBar {
  background-color: #0b181f !important;
}

.theme--dark .elevation1 {
  background-color: #031c28 !important;
}
.theme--dark .elevation2 {
  background-color: #041d29 !important;
}
.theme--dark .elevation3 {
  background-color: #062531 !important;
}
.theme--dark .elevation4 {
  background-color: #0c2d3d !important;
}
.theme--dark .primaryText {
  color: #b3babe !important;
}
.theme--dark .secondaryText {
  color: #a4adb3 !important;
}
.theme--dark .terciaryText {
  color: #76868e !important;
}
.theme--dark .siteText {
  color: #486674 !important;
}
.theme--dark .navText {
  color: #76868e !important;
}
.theme--dark .navTextSelected {
  color: #a4adb3 !important;
}
.theme--dark .linkText {
  color: #a4adb3 !important;
}
.v-application a {
  color: var(--v-link-base);
}
.theme--dark.v-divider {
  border-color:  rgba(255, 255, 255, .08) !important;
}
.v-main {
  z-index: 0;
}
</style>
