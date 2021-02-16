<template>
  <v-card
    elevation="0"
    width="100%"
    class="mx-auto"
    style="background-color: transparent;"
  >
    <v-carousel
      :continuous="true"
      :cycle="true"
      :interval="intervalChanger"
      show-arrows-on-hover
      hide-delimiter-background
      delimiter-icon="mdi-hexagon-outline"
      @change="
      carouselVal=0
      intervalChanger = 5000000
      "
      v-model="model"
    >
      <template
        v-slot:prev="{ on, attrs }"
        class="test"
      >
        <div
          v-bind="attrs"
          class="hoverArrow"
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

      <template v-slot:next="{ on, attrs }">
        <div
          v-bind="attrs"
          class="hoverArrow"
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
        :src="require(`@/${image}`)"
      />
    </v-carousel>
    <v-progress-linear
      :value="carouselVal"
      background-opacity="0"
      style="height: 0.4vh"
      color="primary"
    />
  </v-card>
</template>

<script>
  export default {

    props: {
      images: Array,
      visible: Boolean,
      time: Number,
    },
    watch: {
      visible: function () {
        this.carouselVal = 0
        this.cycle = true
      },
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
        cycle: false,
        interval: {},
        intervalChanger: 5000000,
        model: 0,
      }
    },

    mounted: function () {
      this.interval = window.setInterval(() => {
        if (this.cycle) {
          if (this.carouselVal >= 100) {
            this.carouselVal = 0
            this.model += 1
            return
          }
          this.carouselVal += 0.03 * 100 / this.time
        }
      }, 30)
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
.hoverArrow {
    transition: all .1s ease-in-out;
}
.hoverArrow:hover {
    transform: scale(1.3);
}
.v-progress-linear {
  transition: 0.02s cubic-bezier(0.4, 0, 0.6, 1);
}
</style>
