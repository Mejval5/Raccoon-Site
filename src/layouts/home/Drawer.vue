<template>
  <v-navigation-drawer
    right
    fixed
    height="auto"
    overlay-color="secondary"
    overlay-opacity=".8"
    temporary
    v-bind="$attrs"
    v-on="$listeners"
  >
    <v-list
      shaped
    >
      <v-list-item
        v-for="link in links"
        :key="link.name"
        :to="{ name: link.name, hash: link.hash }"
        :exact="link.name === 'Home'"
        color="primary"
      >
        <v-list-item-content>
          <v-list-item-title v-text="link.name" />
        </v-list-item-content>
      </v-list-item>
    </v-list>
  </v-navigation-drawer>
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
