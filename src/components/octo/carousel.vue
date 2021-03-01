<template>
  <v-card
    elevation="0"
    width="100%"
    class="mx-auto rounded overflow-hidden"
    style="background-color: transparent;"
  >
    <v-carousel
      v-model="model"
      :continuous="true"
      :cycle="cycle"
      :interval="time * 1000"
      show-arrows-on-hover
      hide-delimiter-background
      delimiter-icon="mdi-hexagon-outline"
      :height="carouselHeight"
      @change="
        carouselVal=0
      "
    >
      <template
        v-slot:prev="{ on, attrs }"
      >
        <div
          v-bind="attrs"
          class="hoverArrow d-none d-md-block"
          v-on="on"
        >
          <v-icon
            style="position: absolute; opacity: 0.8;"
            large
            dark
          >
            mdi-chevron-left
          </v-icon>
          <v-icon
            style="position: relative;"
            large
            light
          >
            mdi-chevron-left-circle
          </v-icon>
        </div>
      </template>

      <template
        v-slot:next="{ on, attrs }"
      >
        <div
          v-bind="attrs"
          class="hoverArrow d-none d-md-block"
          v-on="on"
        >
          <v-icon
            style="position: absolute; opacity: 0.8;"
            large
            dark
          >
            mdi-chevron-right
          </v-icon>
          <v-icon
            style="position: relative;"
            large
            light
          >
            mdi-chevron-right-circle
          </v-icon>
        </div>
      </template>
      <v-carousel-item
        v-for="(image, i) in images"
        :key="i"
        class="rounded"
        eager
      >
        <v-sheet
          height="100%"
          class="rounded transparent"
          eager
        >
          <v-img
            :src="require(`@/${image}`)"
            class="rounded"
            aspect-ratio="0.5625"
            eager
          />
        </v-sheet>
      </v-carousel-item>
    </v-carousel>
    <v-progress-linear
      :value="carouselVal"
      background-opacity="0"
      color="primary"
      class="rounded-b d-none d-md-block"
    />
  </v-card>
</template>

<script>
  export default {

    props: {
      images: Array,
      visible: Boolean,
      time: Number,
      image: String,
    },
    data () {
      return {
        colors: [
          'green',
          'secondary',
          'yellow darken-4',
          'red lighten-2',
          'orange darken-1',
        ],
        carouselVal: 0,
        cycle: true,
        interval: {},
        model: 0,
      }
    },
    computed: {
      carouselHeight () {
        return this.$vuetify.breakpoint.mdAndUp ? '70vh' : '70vh'
      },
    },
    watch: {
      visible: function () {
        this.carouselVal = 0
        this.model = 0
      },
    },
    mounted: function () {
      if (this.$vuetify.breakpoint.mdAndUp) {
        this.cycle = false
        this.interval = window.setInterval(() => {
          if (this.time !== 0) {
            if (this.carouselVal >= 100) {
              this.carouselVal = 0
              this.model += 1
              return
            }
            this.carouselVal += 0.02 * 100 / this.time
          }
        }, 20)
      }
    },
    beforeDestroy: function () {
      window.clearInterval(this.interval)
    },
  }
</script>

<style>
.v-window__prev {
    background: rgba(0,0,0,0) !important;
}
.v-window__next {
    background: rgba(0,0,0,0) !important;
}
.v-icon.v-icon::after {
    background-color: transparent;
}
.v-carousel__controls__item {
  margin: 0 6px;
}
.hoverArrow {
    transition: all .5s ease-in-out;
}
.hoverArrow:hover {
    transform: scale(1.3);
}
.v-progress-linear {
  position: absolute;
  transform: translateY(-0.4vh);
  height: 0.4vh;
  transition: all 0.05s !important;
}
.v-carousel__controls__item.v-btn:hover {
  transform: scale(1.5);
  transition: all 0.1s ease-in-out;
}
</style>
