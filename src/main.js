import Vue from 'vue'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import axios from 'axios'
import VueAxios from 'vue-axios'
import { VueReCaptcha } from 'vue-recaptcha-v3'
import './plugins'

Vue.use(VueAxios, axios)
Vue.use(VueReCaptcha, {
  siteKey: '6Ld5nG4aAAAAAPOw3ToQ1tLh5wcv6OEPTnl-Zcyb',
  loaderOptions: {
    useRecaptchaNet: true,
  },
})

Vue.config.productionTip = false

new Vue({
  router,
  mounted () {
    document.dispatchEvent(new Event('render-event'))
  },
  vuetify,
  render: h => h(App),
}).$mount('#app')
