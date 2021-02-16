<template>
  <v-container>
    <v-row
      class="fill-height"
      justify="center"
    >
      <v-col
      cols="4"
      align="center"
      >
        <base-carousel
          :images="images"
          :visible="visible"
          :time="6"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    name: 'BaseCard',

    inheritAttrs: false,

    props: {
      height: [Number, String],
      width: [Number, String],
      subtitle: String,
      title: String,
      visible: Boolean,
    },
    data () {
      return {
        images: [
          'assets/game-3.png',
          'assets/game-2.png',
          'assets/game-1.png',
        ],
      }
    },
    methods: {
      onScroll () {},
    },
  }
</script>

<style scoped>
.hideScroll {
  backdrop-filter: blur(2px) !important;
  border-radius: 4px;
}
.hideScroll ::-webkit-scrollbar {
  width: 0.3vw;
  position: relative !important;
}
.hideScroll ::-webkit-scrollbar-track {
  box-shadow: inset 0 0 0.3vw grey;
  border-radius: 4px;
}
.hideScroll ::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 0.2vw grey;
  border-radius: 4px;
}
.expansionPanel {
  position: absolute;
  transform: translate(-50%, -50%);
  top: 50%;
  left: 50%;
  width: 60%;
  z-index: 999!important;
  pointer-events: auto;
}
.theme--dark.v-expansion-panels .v-expansion-panel {
  background-color: transparent;
}
.v-application--is-ltr .v-expansion-panel-header {
  backdrop-filter: blur(0px);
  text-align: center;
  font-size: 2vh;
  font-weight: 700;
  position: relative;
  width: fit-content;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 999!important;
  pointer-events: auto;
  opacity: 1;
  text-shadow: 0 0 1vh rgba(255,255,255,0.0);
}

.theme--dark.v-btn.v-btn--has-bg {
  backdrop-filter: blur(0px);
}
.v-expansion-panel-content {
  background-color: transparent;
  position: relative;
  top: 0px !important;
  left: 0px !important;
}
.v-expansion-panel::before {
  box-shadow: 0 0 0 0;
}
.theme--dark.v-expansion-panels .v-expansion-panel:not(:first-child)::after {
  border-color: transparent;
}
</style>
