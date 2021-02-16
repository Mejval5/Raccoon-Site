<template>
  <v-card
    class="mx-auto my-0 d-flex flex-column rounded elevation1 elevation-0"
    style="position: relative;"
    max-width="345"
    :height="$vuetify.breakpoint.smAndUp ? &quot;620&quot; : &quot;&quot; "
  >
    <template slot="progress">
      <v-progress-linear
        color="deep-purple"
        height="10"
        indeterminate
      />
    </template>

    <router-link
      v-if="samepage"
      :to="gamelink"
      color="transparent"
    >
      <v-img
        class="rounded-t"
        height="250"
        :src="require(`@/${image}`)"
      />
    </router-link>

    <a
      v-else
      target="_blank"
      :href="gamelink"
    >
      <v-img
        class="rounded-t"
        height="250"
        :src="require(`@/${image}`)"
      />
    </a>

    <v-card-title
      v-if="headline"
      class="text-h5 d-flex align-start primaryText"
      v-text="headline"
    />

    <v-card-text class="my-0 py-0">
      <v-row align="center" />

      <div
        v-if="subtitle"
        class="mt-4 mb-1 subtitle-1 secondaryText"
        v-text="subtitle"
      />
      <v-divider
        class="pb-2 pt-0"
      />

      <div
        class="subtitle-1 my-1 terciaryText"
        v-html="text"
      />
    </v-card-text>

    <v-card
      class="flex-grow-1 d-flex justify-center align-end"
      color="transparent"
      flat
    >
      <router-link
        v-if="samepage"
        :to="gamelink"
        class="text-decoration-none"
      >
        <v-btn
          class="my-6 elevation4 linkText rounded-xl"
          elevation="0"
          x-large
        >
          <b>Learn more</b>
        </v-btn>
      </router-link>
      <v-btn
        v-else
        class="my-6 elevation4 linkText rounded-xl"
        x-large
        elevation="0"
        :href="gamelink"
        target="_blank"
      >
        <b>Learn more</b>
      </v-btn>
    </v-card>
  </v-card>
</template>
<script>
  export default {
    name: 'GameCard',

    inheritAttrs: false,

    props: {
      gamelink: String,
      headline: String,
      subtitle: String,
      text: String,
      image: String,
      samepage: String,
    },
  }
</script>
<style lang='scss'>
.v-card__title {
  word-break: normal !important;
}
.elevation-n1 {
  box-shadow: inset 0 0px 10px black !important;
}
.elevation-p1 {
  box-shadow: 0 0px 10px black !important;
}
.shadow {
    position: absolute;
    width: 100%;
    height: 100%;
    box-shadow: inset 0px 0px 10px 0 #000000;
    border-radius: 20px;
    top: 0;
    left: 0;
}
// .elevation-n1-image.v-image .v-image__image {
//   box-shadow: inset 0px 13px 10px -10px black,
//   inset -13px 0px 10px -10px black,
//   inset 13px 0px 10px -10px black !important;
//   border-top-left-radius: 24px !important;
//   border-top-right-radius: 24px !important;
// }
.elevation-n1-image.v-image .v-image__image {
  box-shadow: inset 0px 0px 15px 5px black !important;
  border-top-left-radius: 24px !important;
  border-top-right-radius: 24px !important;
}
</style>
