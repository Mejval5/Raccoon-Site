<template>
  <v-container
    v-scroll.self="onScroll"
    fluid
    class="overflow-y-auto hideScroll py-0"
    style="height: inherit;"
  >
    <v-row
      dense
      align-content="center"
      justify="center"
      no-gutters
      class="d-md-none mb-0 pt-2"
    >
      <v-col>
        <v-btn
          block
          color="transparent"
          elevation="0"
          @click="goBack"
        >
          <v-icon
            class="mr-auto"
          >
            mdi-keyboard-backspace
          </v-icon>
        </v-btn>
      </v-col>
    </v-row>
    <div
      :class="divClass"
    >
      <div
        class="rounded"
      >
        <v-row
          dense
          align="center"
          justify="center"
        >
          <v-col
            class="d-none d-md-block text-right py-0"
            align-self="stretch"
            cols="1"
          >
            <v-btn
              large
              class="rounded-lg d-block"
              style="height: 98.5vh; position: sticky; top: 0;"
              color="transparent"
              elevation="0"
              @click="goBack"
            >
              <v-icon>mdi-keyboard-backspace</v-icon>
            </v-btn>
          </v-col>
          <v-col
            ref="devs"
            class="pt-4 pb-n2"
            cols="12"
            md="11"
            lg="10"
            xl="10"
          >
            <octo-devs />
          </v-col>
        </v-row>
        <v-row
          dense
          align-content="center"
          justify="center"
          no-gutters
          class="d-md-none mb-3 pt-10"
        >
          <v-col>
            <v-btn
              block
              color="transparent"
              class="mb-3"
              elevation="0"
              @click="goBack"
            >
              <v-icon>mdi-keyboard-backspace</v-icon>
            </v-btn>
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
          'assets/octoPR/01.jpg',
          'assets/octoPR/02.jpg',
          'assets/octoPR/03.jpg',
          'assets/octoPR/04.jpg',
          'assets/octoPR/05.jpg',
          'assets/octoPR/06.jpg',
        ],
        divClass: '',
      }
    },
    mounted () {
      // Register an event listener when the Vue component is ready
      window.addEventListener('resize', this.onResize)
      this.onResize()
    },

    beforeDestroy () {
      // Unregister the event listener before destroying this Vue instance
      window.removeEventListener('resize', this.onResize)
    },
    methods: {
      onResize () {
        if (this.$refs.devs.clientHeight + 10 < this.$vuetify.breakpoint.height && this.$vuetify.breakpoint.mdAndUp) {
          this.divClass = 'center'
        } else {
          this.divClass = ''
        }
      },
      onScroll () {},
      goBack () {
        this.$emit('clicked', 'second')
      },
    },
  }
</script>

<style scoped>
.hideScroll {
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
::-webkit-scrollbar {
  width: 4px;
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
.hideScroll {
  background-color: #48667401;
}
</style>
