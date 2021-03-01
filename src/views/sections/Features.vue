<template>
  <section
    id="features"
    class="elevation1 elevation-0 mx-10 mb-5 rounded pt-5"
  >
    <v-container
      fluid
    >
      <v-row>
        <v-col>
          <menu-svg class="svg" />
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>

<script>
  export default {
    name: 'SectionFeatures',

    components: {
      MenuSvg: () => import('@/assets/menu/menu'),
    },

  }
</script>

<style>
.svg {
  width: 100%;
  height: 100vh;
}
</style>
