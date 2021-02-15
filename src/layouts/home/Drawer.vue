<template>
  <v-expand-x-transition>
    <v-navigation-drawer
      class="rounded ma-0 elevation1AppBar elevation-0"
      right
      fixed
      height="auto"
      overlay-color="bg"
      overlay-opacity="0.9"
      temporary
      v-bind="$attrs"
      v-on="$listeners"
    >
      <v-list
        rounded
      >
        <v-list-item
          v-for="link in links"
          :key="link.name"
          :to="{ name: link.name, hash: link.hash }"
          :exact="link.name === 'Home'"
          class="navTextSelected"
          active-class="rounded-xl"
        >
          <v-list-item-content>
            <v-list-item-title
              class="navText"
              v-text="link.name"
            />
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
  </v-expand-x-transition>
</template>

<script>
  export default {
    name: 'HomeDrawer',

    props: {
      links: {
        type: Array,
        default () {
          return [{ name: '', hash: '' }]
        },
      },
    },
    data: () => ({
      link: { name: 'Home', hash: '' },
      name: '',
      hash: '',
    }),
  }
</script>

<style scoped>
.v-list-item::before {
  border-radius: 4px !important;
}
</style>
