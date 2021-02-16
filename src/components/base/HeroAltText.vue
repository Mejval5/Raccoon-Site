<template>
  <v-container
    :class="get_container_class"
    fluid
  >
    <v-row
      class="align-content-stretch mx-auto align-self-center"
    >
      <v-col
        class="pa-0"
      >
        <v-card
          :class="get_class"
          :style="get_style"
        >
          <base-heading
            :title="title"
            class="primaryText"
            mobile-size="display-2"
            space="4"
          />
          <base-divider
            class="pa-0"
            color="primary"
            dense
          />
          <v-breadcrumbs
            :items="items"
            class="justify-center pa-0 primaryText"
            divider=">"
          />
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    name: 'HeroAltText',

    props: {
      elevated: {
        type: Boolean,
        default: false,
      },
      title: String,
    },

    computed: {
      get_class () {
        return this.elevated ? 'pa-5 rounded elevation1 elevation-0' : 'pa-5 overlay rounded elevation-0'
      },
      get_style () {
        return this.elevated ? '' : 'width: fit-content; margin-left: auto; margin-right: auto;'
      },
      get_container_class () {
        return this.elevated ? 'fill-height align-start mt-5 px-0' : 'fill-height align-start'
      },
      items () {
        return [
          { text: 'HOME', to: '/', link: true },
          { text: this.title },
        ]
      },
    },
  }
</script>
