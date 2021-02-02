// Vuetify Documentation https://vuetifyjs.com

import Vue from 'vue'
import Vuetify from 'vuetify/lib/framework'
import { preset } from 'vue-cli-plugin-vuetify-preset-rally/preset'
import {
  VCol,
  VRow,
} from 'vuetify/lib'

Vue.use(Vuetify, {
  components: {
    VCol,
    VRow,
  },
})

export default new Vuetify({
  preset,
  theme: {
    dark: true,
    themes: {
      light: {
        primary: '#42a5f6',
        secondary: '#050b1f',
        accent: '#204165',
      },
      dark: {
        primary: '#cdcddfff',
      },
    },
  },
})
