<template>
  <v-app>
    <!--    <home-system-bar />
    <div class="test align-end justify-end elevation1 rounded-xl" />
    <div class="test2 elevation1 rounded-xl" />
    -->
    <home-app-bar />

    <home-view />

    <home-footer />
    <!--    <home-settings /> -->
  </v-app>
</template>

<script>
  export default {
    name: 'HomeLayout',

    components: {
      HomeAppBar: () => import('@/layouts/home/AppBar'),
      HomeFooter: () => import('@/layouts/home/Footer'),
      /* HomeSettings: () => import('@/layouts/home/Settings'), */
      /* HomeSystemBar: () => import('@/layouts/home/SystemBar'), */
      HomeView: () => import('@/layouts/home/View'),
    },
  }
</script>

<style lang="scss">
.test {
  left: 0px;
  width: 20px;
  height: 100%;
  position: absolute;
}
.test2 {
  height: 100%;
  right: 0px;
  width: 20px;
  position: absolute;
}
</style>
