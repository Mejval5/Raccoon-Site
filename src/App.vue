<template>
  <v-fade-transition
    mode="out-in"
    appear
    @after-enter="afterEnter"
  >
    <div
      style="position: absolute; width: 100%; height: 100%; overflow: hidden"
      class="bg"
    >
      <router-view />
    </div>
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
.bg {
  background-color: black !important;
}
.body {
  background-color: black !important;
}
.theme--dark.v-application {
  background-color: #000000 !important;
  background-size: 550px 550px, 350px 350px, 250px 250px, 150px 150px;
  background-position: 0 0, 40px 60px, 130px 270px, 70px 100px;
  height: 100%;
  width: 100%;
  position: absolute;
  z-index: 0;
}
.theme--dark .overlay {
  background-color: #081214df !important;
}
.theme--dark .elevation1AppBar {
  background-color: #0b181f !important;
}

.theme--dark .elevation1 {
  background-color: #121212 !important;
}
.theme--dark .elevation2 {
  background-color: #212121 !important;
}
.theme--dark .elevation3 {
  background-color: #303030 !important;
}
.theme--dark .elevation4 {
  background-color: #424242 !important;
}
.theme--dark .octoPrimaryText {
  color: #d1dadf !important;
}
.theme--dark .octoSecondaryText {
  color: #c1cbd1 !important;
}
.theme--dark .octoTerciaryText {
  color: #9eb2bd !important;
}
.theme--dark .primaryText {
  color: #FFFFFFDE !important;
}
.theme--dark .secondaryText {
  color: #FFFFFF99 !important;
}
.theme--dark .terciaryText {
  color: #FFFFFF61 !important;
}
.theme--dark .siteText {
  color: #486674 !important;
}
.theme--dark .navText {
  color: #76868e !important;
}
.theme--dark .navTextHover {
  color: #9cb1bb !important;
}
.theme--dark .navTextSelected {
  color: #a4adb3 !important;
}
.theme--dark .linkText {
  color: #ffa007 !important;
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
::-webkit-scrollbar {
  width: 0px;
  position: relative !important;
  border-radius: 25px;
}
::-webkit-scrollbar-track {
  box-shadow: inset 0 0 4px #486674;
  border-radius: 10px;
}
::-webkit-scrollbar-thumb {
  background: #486674;
  border-radius: 10px;
}
.grecaptcha-badge { visibility: hidden; }

.theme--dark.v-skeleton-loader .v-skeleton-loader__avatar, .theme--dark.v-skeleton-loader .v-skeleton-loader__button, .theme--dark.v-skeleton-loader .v-skeleton-loader__chip, .theme--dark.v-skeleton-loader .v-skeleton-loader__divider, .theme--dark.v-skeleton-loader .v-skeleton-loader__heading, .theme--dark.v-skeleton-loader .v-skeleton-loader__image, .theme--dark.v-skeleton-loader .v-skeleton-loader__text {
  background: #212121aa !important;
}

.theme--dark.v-skeleton-loader .v-skeleton-loader__actions, .theme--dark.v-skeleton-loader .v-skeleton-loader__article, .theme--dark.v-skeleton-loader .v-skeleton-loader__card-heading, .theme--dark.v-skeleton-loader .v-skeleton-loader__card-text, .theme--dark.v-skeleton-loader .v-skeleton-loader__date-picker, .theme--dark.v-skeleton-loader .v-skeleton-loader__list-item, .theme--dark.v-skeleton-loader .v-skeleton-loader__list-item-avatar, .theme--dark.v-skeleton-loader .v-skeleton-loader__list-item-text, .theme--dark.v-skeleton-loader .v-skeleton-loader__list-item-two-line, .theme--dark.v-skeleton-loader .v-skeleton-loader__list-item-avatar-two-line, .theme--dark.v-skeleton-loader .v-skeleton-loader__list-item-three-line, .theme--dark.v-skeleton-loader .v-skeleton-loader__list-item-avatar-three-line, .theme--dark.v-skeleton-loader .v-skeleton-loader__table-heading, .theme--dark.v-skeleton-loader .v-skeleton-loader__table-thead, .theme--dark.v-skeleton-loader .v-skeleton-loader__table-tbody, .theme--dark.v-skeleton-loader .v-skeleton-loader__table-tfoot {
  background: #121212 !important;
}

</style>
