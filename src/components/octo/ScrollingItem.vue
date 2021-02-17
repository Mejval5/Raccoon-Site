<template>
  <v-container
  v-scroll.self="onScroll"
  fluid
  class="overflow-y-auto"
  style="height: inherit;"
  >
  <div
  class="center"
  >
    <v-row
    dense
    align-content="center"
    justify="center"
    no-gutters
    >
      <v-col>
        <v-btn
        icon
        @click="goBack"
        >
          <v-icon>mdi-keyboard-backspace</v-icon>
        </v-btn>
      </v-col>
    </v-row>
  <div
  class="mb-n1 rounded"
  style="backdrop-filter: blur(10px);"
  >
    <v-row
    dense
    align-content="center"
    justify="center"
    no-gutters
    >
    <v-col
      cols="12"
      sm="8"
      order="1"
    >
    <octo-game-description />
    </v-col>
      <v-col
      cols="12"
      sm="4"
      order="0"
      order-sm="2"
      >
        <octo-carousel
          :images="images"
          :visible="visible"
          :time="6"
        />
      </v-col>
    </v-row>
  </div>
  </div>
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
          'assets/octoPR/01.png',
          'assets/octoPR/02.png',
          'assets/octoPR/03.png',
          'assets/octoPR/04.png',
          'assets/octoPR/05.png',
          'assets/octoPR/06.png',
        ],
      }
    },
    methods: {
      onScroll () {},
      goBack () {
        this.$emit('clicked', 'first')
      },
    },
  }
</script>

<style scoped>
.hideScroll {
  backdrop-filter: blur(0px) !important;
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
.center {
  position: relative;
  transform: translate(-50%, -50%);
  top: 50%;
  left: 50%;
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
.blurryBG {
  backdrop-filter: blur(0px);
}
.hideScroll {
  background-color: transparent;
  backdrop-filter: blur(0px) !important;
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
</style>
