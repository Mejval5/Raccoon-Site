<template>
  <div>
    <div
      class="rounded"
      style="overflow: hidden; height: fit-content;"
    >
      <v-skeleton-loader
        v-if="!loaded"
        type="image, card-heading, list-item, list-item-three-line, list-item-three-line, list-item-two-line, actions, card-heading"
        class="mx-auto"
        width="345"
        :height="$vuetify.breakpoint.smAndUp ? &quot;620&quot; : &quot;&quot; "
      />
    </div>
    <v-card
      v-if="loaded"
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
        :to="bloglink"
        color="transparent"
        style="height:250px;"
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
        :href="bloglink"
        style="height:250px;"
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
        :style="$vuetify.breakpoint.smAndUp ? 'min-height: 96px;' : ''"
        v-text="headline"
      />

      <v-card-text class="my-0 py-0">
        <v-row
          align="center"
          class="pt-1"
          no-gutters
        >
          <v-col
            cols="12"
            md="8"
          >
            <div
              v-if="subtitle"
              class="mb-1 text-subtitle-1 terciaryText"
              v-html="subtitle"
            />
          </v-col>
          <v-col
            cols="12"
            md="4"
          >
            <div
              v-if="subtitle"
              class="mb-1 text-subtitle-1 text-right terciaryText"
              v-text="formatedDate"
            />
          </v-col>
        </v-row>
        <v-divider
          class="pb-2 pt-0"
        />

        <div
          class="text-subtitle-1 my-1 secondaryText"
          v-html="text"
        />
      </v-card-text>

      <v-card
        class="flex-grow-1 d-flex justify-end mr-6 align-end"
        color="transparent"
        flat
      >
        <router-link
          v-if="samepage"
          :to="bloglink"
          class="text-decoration-none"
        >
          <v-btn
            class="my-6 elevation2 linkText rounded"
            elevation="0"
            x-large
          >
            <v-icon> mdi-arrow-right </v-icon>
          </v-btn>
        </router-link>
        <v-btn
          v-else
          class="my-6 elevation3 linkText rounded-xl"
          x-large
          elevation="0"
          :href="bloglink"
          target="_blank"
        >
          <v-icon> mdi-arrow-right </v-icon>
        </v-btn>
      </v-card>
    </v-card>
  </div>
</template>
<script>
  export default {
    name: 'BlogCard',

    inheritAttrs: false,

    props: {
      bloglink: String,
      headline: String,
      subtitle: String,
      text: String,
      image: String,
      samepage: String,
      date: Number,
      showCard: Boolean,
    },

    data () {
      return {
        loaded: false,
      }
    },
    computed: {
      formatedDate () {
        const [_month, _date, _year] = new Date(this.date).toLocaleDateString('en-US').split('/')
        return _date.toString() + '. ' + _month.toString() + '. ' + _year.toString()
      },
    },
    watch: {
      showCard: function (oldVal, newVal) {
        this.loaded = this.showCard
      },
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
