
<template>
  <v-expand-x-transition>
    <v-container
      class="pa-0 ma-0 fill-height"
      :style="get_height_dirty"
      fluid
    >
      <div
        class="rounded-0"
        style="overflow: hidden; height: 100%; width: 100%; max-width: 1600px; margin: auto; margin: auto; z-index: 1600; position:static;"
      >
        <div
          class="rounded-0"
          style="height: 100%;  width: 100%; overflow: hidden; "
        >
          <v-row
            v-show="expand"
            v-resize="onResize"
            class="align-center ma-0"
            justify="center"
            align="center"
            style=" height: 100%; width: 100%;"
          >
            <v-col
              class="pa-0"
              cols="12"
              style="display: block; height: 100%;"
            >
              <div
                class="parent"
                :style="get_mobile_size"
              >
                <div class="child">
                  <div
                    id="scene"
                    data-relative-input="true"
                    class="scene"
                  >
                    <div
                      data-depth="0.30"
                      class="bg1"
                    >
                      <img
                        :src="require('@/assets/milan/1.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.30"
                      class="bg2"
                    >
                      <img
                        :src="require('@/assets/milan/2.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.33"
                      class="bg3"
                    >
                      <img
                        :src="require('@/assets/milan/3.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.36"
                      class="bg4"
                    >
                      <img
                        :src="require('@/assets/milan/4.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.39"
                      class="bg5"
                    >
                      <img
                        :src="require('@/assets/milan/5.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.42"
                      class="bg6"
                    >
                      <img
                        :src="require('@/assets/milan/6.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.45"
                      class="bg7"
                    >
                      <img
                        :src="require('@/assets/milan/7.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.48"
                      class="bg8"
                    >
                      <img
                        :src="require('@/assets/milan/8.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.51"
                      class="bg9"
                    >
                      <img
                        :src="require('@/assets/milan/9.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.54"
                      class="bg10"
                    >
                      <img
                        :src="require('@/assets/milan/10.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.57"
                      class="bg11"
                    >
                      <img
                        :src="require('@/assets/milan/11.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.60"
                      class="bg12"
                    >
                      <img
                        :src="require('@/assets/milan/12.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.63"
                      class="bg13"
                    >
                      <img
                        :src="require('@/assets/milan/13.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.66"
                      class="bg14"
                    >
                      <img
                        :src="require('@/assets/milan/14.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.69"
                      class="bg15"
                    >
                      <img
                        :src="require('@/assets/milan/15.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.72"
                      class="bg16"
                    >
                      <img
                        :src="require('@/assets/milan/16.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.75"
                      class="bg17"
                    >
                      <img
                        :src="require('@/assets/milan/17.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.78"
                      class="bg18"
                    >
                      <img
                        :src="require('@/assets/milan/18.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.81"
                      class="bg19"
                    >
                      <img
                        :src="require('@/assets/milan/19.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <!--<div data-depth="0.3" class="border"></div>-->
                    <div
                      data-depth="0.84"
                      class="bg20"
                    >
                      <img
                        :src="require('@/assets/milan/20Overlay.png')"
                        width="120%"
                        style="margin-left:-10%;margin-top:-10%;"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.84"
                      class="bg20"
                    >
                      <img
                        :src="require('@/assets/milan/20.png')"
                        width="100%"
                        class="gg"
                      >
                    </div>
                    <div
                      data-depth="0.84"
                      class="bgLight"
                    >
                      <img
                        :src="require('@/assets/milan/Light.png')"
                        width="100%"
                        class="gg gg1"
                      >
                    </div>
                    <div
                      data-depth="0.78"
                      class="menu1 primaryText"
                      style="opacity: 1;text-shadow: 0 0 1vh rgba(255,255,255,0.0)"
                    >
                      <p><a>OCTOMANCER</a> <br><br> <a>BROTAGONISTS™</a> <br><br> <a>SUPPORT US</a> <br><br> <a>CONTACT</a></p>
                    </div>
                  </div>
                </div>
              </div>
            </v-col>
          </v-row>
          <v-row
            v-show="!expand"
            class="fill-height ma-0"
            align="center"
            justify="center"
          >
            <v-progress-circular
              indeterminate
              color="grey lighten-5"
            />
          </v-row>
        </div>
      </div>
    </v-container>
  </v-expand-x-transition>
</template>

<script>
  import Parallax from '@/plugins/parallax.js'

  // Extensions
  import View from '@/views/View'

  // Mixins
  import LoadSections from '@/mixins/load-sections'

  export default {

    name: 'Octomancer',

    extends: View,

    props: {
      id: {
        type: String,
        default: 'octomancer',
      },
    },

    data: () => ({
      expand: false,
      parallaxInstance: {},
    }),

    computed: {
      get_mobile_size () {
        return this.$vuetify.breakpoint.mdAndUp ? this.$vuetify.breakpoint.xlAndUp ? 'width: 150%;' : 'width: 150%;' : 'width: 2560px;'
      },
      get_height_dirty () {
        var height = this.$vuetify.breakpoint.mdAndUp ? 'calc(100vh - 90px)' : 'calc(100vh - 118px)'
        return 'max-height: ' + height + ';'
      },
    },

    mounted () {
      var scene = document.getElementById('scene')
      this.parallaxInstance = new Parallax(scene)
      this.show_image()
    },

    methods: {
      async show_image () {
        await new Promise(resolve => setTimeout(resolve, 1000))
        this.expand = true
        this.firstLoad()
      },
      onResize (event) {
        try {
          if (this.$vuetify.breakpoint.mdAndUp && !this.parallaxInstance.enabled) {
            this.parallaxInstance.enableThisF()
          }
          if (!this.$vuetify.breakpoint.mdAndUp && this.parallaxInstance.enabled) {
            this.parallaxInstance.disableThisF()
          }
          console.log(this.parallaxInstance)
        } catch {}
      },
      firstLoad () {
        if (this.$vuetify.breakpoint.mdAndUp) {
          this.parallaxInstance.enableThisF()
        }
        if (!this.$vuetify.breakpoint.mdAndUp) {
          this.parallaxInstance.disableThisF()
        }
        console.log(this.parallaxInstance)
        console.log(this.$vuetify.breakpoint.mdAndUp)
      },
    },

    metaInfo: { title: 'Octomancer' },
  }
  </script>

<style scoped>
@charset "utf-8";
/* CSS Document */
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap');

body {background-color:#e0e0e0;}
body {background-color:rgba(8,18,20,1);color: white;font-family: 'Quicksand', sans-serif;}

.parent {
position: relative;
z-index: 997;
min-width: 800px;
width: 150vw;
top: 50%;
margin-left: 50%;
transform: translate(-50%, -50%);
}

.child {
width:100%;
height:auto;
z-index: 998;
pointer-events: none;
}

.scene {
width:100%;
height:100%;
}

/*.border {
width: 100%;
height: 100%;
background-color:#e0e0e0;
    box-shadow: 0 0 0 10vw black;
}*/

.bg20 {
outline: 1000px solid rgba(8,18,20,1);
}

.fixedMenu{
width: 100%;
height: 200px;
background-color: #e0e0e0;
z-index: 999;
}
.menu1
{
width: 100%;
text-align: center;
}

.menu1 p {
font-size: 2vh;
padding-top: 23%;
font-weight: 700;
position: relative;
z-index: 999!important;
pointer-events: auto;
}

a {
text-decoration: none;
cursor: pointer;
color: inherit;
}
.elevation-n1 {
  box-shadow: inset 0px 0px 100px 100px black !important;
}

</style>
