<template>
  <section
    :id="id"
    style="height: 100%;"
  >
    <v-row
      no-gutters
      style="height: 100%;"
    >
      <v-col cols="12">
        <component
          :is="`section-${section}`"
          v-for="section in sections"
          :key="section"
        />
      </v-col>
    </v-row>
  </section>
</template>

<script>
  export default {
    name: 'BaseView',

    props: {
      id: {
        type: String,
        default: 'view',
      },
    },

    data: () => ({ sections: [] }),
  }
</script>
