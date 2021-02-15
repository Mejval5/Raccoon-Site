<template>
  <v-container
    fluid
    class="pa-sm-0"
  >
    <v-row
      class="ma-0 my-2"
      dense
    >
      <v-col
        cols="12"
        md="8"
        class="pa-0"
      >
        <base-heading
          :title="title"
          class="secondaryText"
          weight="normal"
          size="display-1"
          mobile-size="headline"
          space="0"
        />
      </v-col>
      <v-spacer />
      <v-col
        cols="12"
        md="2"
        align-self="end"
        :style="$vuetify.breakpoint.mdAndUp ? 'text-align: end;' : 'text-align: start;'"
      >
        <div
          class="body-1 terciaryText"
          v-text="formated_date()"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-divider />
    </v-row>
  </v-container>
</template>

<script>
  export default {
    name: 'SectionFeatures',

    props: {
      date: Number,
      title: String,
    },

    data: () => ({
    }),

    methods: {
      formated_date () {
        const [_month, _date, _year] = new Date(this.date).toLocaleDateString('en-US').split('/')
        return _date.toString() + '. ' + _month.toString() + '. ' + _year.toString()
      },
    },
  }
</script>
