<template>
  <v-card
    class="mx-auto my-12 d-flex flex-column rounded-xl"
    max-width="374"
    :height="$vuetify.breakpoint.smAndUp ? &quot;620&quot; : &quot;&quot; "
    tile
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
    >
      <v-img
      class="rounded-t-xl"
      max-height="300"
      :src="require(`@/${image}`)"
      />
    </router-link>

    <a
    v-else
    target="_blank"
    :href="gamelink"
    >
      <v-img
      class="rounded-t-xl"
      max-height="300"
      :src="require(`@/${image}`)"
      />
    </a>

    <v-card-title
      v-if="headline"
      class="text-h5 d-flex align-start"
      v-text="headline"
    />

    <v-card-text class="my-0 py-0">
      <v-row align="center" />

      <div
        v-if="subtitle"
        class="my-4 subtitle-1"
        v-text="subtitle"
      />

      <div
        class="subtitle-2 font-weight-bold my-1"
        v-html="text"
      />
    </v-card-text>

    <v-card
      class="flex-grow-1 d-flex justify-center align-end"
      flat
    >
      <v-btn
        class="my-6"
        rounded
        x-large
        color="primary"
        :href="gamelink"
        :target="target"
      >
        <b>Learn more</b>
      </v-btn>
    </v-card>
  </v-card>
</template>
<script>
  export default {
    name: 'BaseCard',

    inheritAttrs: false,

    props: {
      gamelink: String,
      headline: String,
      subtitle: String,
      text: String,
      target: String,
      image: String,
      samepage: String,
    },
  }
</script>
<style lang='scss'>
.v-card__title {
  word-break: normal !important;
}
</style>
